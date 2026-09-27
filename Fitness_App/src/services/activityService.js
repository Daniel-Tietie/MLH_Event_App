import { supabase } from '../lib/supabaseClient'

// All database calls live here. Each returns { data, error } like Supabase does.

const ACTIVITY_COLS = `
      id, host_id, title, description, type, category, opponent_team, city, address,
      location, starts_at, ends_at, max_participants, status, closed_by_cap, night_mode,
      sport:sports(id, name),
      host:profiles!host_id(full_name, avatar_url, is_verified),
      activity_participants(user_id, status, checked_in_at)`

// Events + who's in them. Also asks for the eligibility columns (gender_rule, age_min, age_max);
// if eligibility-setup.sql hasn't been run yet, falls back to the basic columns so nothing breaks.
export async function fetchActivities() {
  const res = await supabase.from('activities').select(`${ACTIVITY_COLS}, gender_rule, age_min, age_max`).order('starts_at')
  if (!res.error) return res
  return supabase.from('activities').select(ACTIVITY_COLS).order('starts_at')
}

export const fetchSports = () => supabase.from('sports').select('id, name').order('name')

export const fetchProfiles = (ids) =>
  supabase.from('profiles').select('id, full_name, avatar_url, is_verified').in('id', ids)

export const createActivity = (activity) => supabase.from('activities').insert(activity)

export const joinActivity = (id) => supabase.rpc('join_activity', { p_activity: id })

export const leaveActivity = (id) => supabase.rpc('leave_activity', { p_activity: id })

export const setActivityStatus = (id, status) =>
  supabase.from('activities').update({ status, closed_by_cap: false }).eq('id', id)

export const getMyQrToken = (id) => supabase.rpc('my_qr_token', { p_activity: id })

export const hostCheckIn = (token) => supabase.rpc('host_check_in', { p_token: token })

// Past events a user really attended (checked in with QR) or hosted, with their review on each.
// Returns [{ id, title, starts_at, city, sport, role: 'host' | 'attended', review }]
export async function fetchActivityHistory(userId) {
  const now = new Date().toISOString()

  const [{ data: joined, error: e1 }, { data: hosted, error: e2 }] = await Promise.all([
    supabase.from('activity_participants').select('activity_id').eq('user_id', userId).eq('status', 'checked_in'),
    supabase.from('activities').select('id').eq('host_id', userId).lte('starts_at', now),
  ])
  if (e1 || e2) throw new Error((e1 || e2).message)

  const hostedIds = new Set((hosted || []).map((r) => r.id))
  const ids = [...new Set([...(joined || []).map((r) => r.activity_id), ...hostedIds])]
  if (!ids.length) return []

  const [{ data: events, error: e3 }, { data: reviews, error: e4 }, { data: photos }] = await Promise.all([
    supabase.from('activities').select('id, title, starts_at, city, sport:sports(name)').in('id', ids).order('starts_at', { ascending: false }),
    supabase.from('comments').select('activity_id, body, created_at').eq('user_id', userId).in('activity_id', ids),
    supabase.from('activity_photos').select('activity_id, image_url').eq('user_id', userId).in('activity_id', ids),
  ])
  if (e3 || e4) throw new Error((e3 || e4).message)

  const reviewBy = Object.fromEntries((reviews || []).map((r) => [r.activity_id, r.body]))
  const signed = await signPhotoUrls((photos || []).map((p) => p.image_url))
  const photosBy = {}
  ;(photos || []).forEach((p) => (photosBy[p.activity_id] ||= []).push(signed[p.image_url] || p.image_url))
  return (events || []).map((e) => ({
    ...e,
    sport: e.sport?.name,
    role: hostedIds.has(e.id) ? 'host' : 'attended',
    review: reviewBy[e.id] || null,
    photos: photosBy[e.id] || [],
  }))
}

// Which of these events has this user already commented on? Returns a Set of activity ids.
export async function fetchCommentedIds(userId, activityIds) {
  if (!activityIds.length) return new Set()
  const { data, error } = await supabase
    .from('comments')
    .select('activity_id')
    .eq('user_id', userId)
    .in('activity_id', activityIds)
  if (error) throw new Error(error.message)
  return new Set((data || []).map((r) => r.activity_id))
}

// ---------- Photos ----------

// Shrink big phone photos before uploading (max 1600px, JPEG) so uploads are fast
async function compressImage(file, maxSize = 1600, quality = 0.82) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale)
    canvas.height = Math.round(img.height * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function uploadActivityPhoto(activityId, userId, file) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image')
  const blob = await compressImage(file)
  const path = `${activityId}/${userId}/${Date.now()}.jpg`
  const { error: upErr } = await supabase.storage.from('activity-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (upErr) throw new Error(upErr.message)
  const { data } = supabase.storage.from('activity-photos').getPublicUrl(path)
  const { error } = await supabase.from('activity_photos').insert({ activity_id: activityId, user_id: userId, image_url: data.publicUrl })
  if (error) throw new Error(error.message)
  return data.publicUrl
}

// The photo bucket is private (only event members can open files), so stored URLs
// are turned into short-lived signed links. Falls back to the stored URL if signing fails.
const PHOTO_BUCKET = 'activity-photos'
const photoPath = (url = '') => url.split(`/${PHOTO_BUCKET}/`)[1]?.split('?')[0]

export async function signPhotoUrls(urls) {
  const paths = [...new Set(urls.map(photoPath).filter(Boolean))]
  if (!paths.length) return {}
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)
  if (error || !data) return {}
  const byPath = Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))
  return Object.fromEntries(urls.map((u) => [u, byPath[photoPath(u)]]).filter(([, v]) => v))
}

// Photos with who uploaded them + report info.
//   uploader -> { full_name, avatar_url } | null
//   reports  -> how many flags (host sees all, others only their own)
//   reportedByMe, hidden
export async function fetchActivityPhotos(activityId, userId) {
  const query = (cols) =>
    supabase.from('activity_photos').select(cols).eq('activity_id', activityId).order('created_at', { ascending: false })

  let { data, error } = await query('id, image_url, user_id, created_at, hidden')
  // Before photo-reports.sql is run there's no "hidden" column, so fall back
  if (error) ({ data, error } = await query('id, image_url, user_id, created_at'))
  if (error) throw new Error(error.message)
  const photos = data || []
  if (!photos.length) return []

  const [{ data: people }, { data: reports }, signed] = await Promise.all([
    fetchProfiles([...new Set(photos.map((p) => p.user_id))]),
    supabase.from('photo_reports').select('photo_id, reporter_id').in('photo_id', photos.map((p) => p.id)),
    signPhotoUrls(photos.map((p) => p.image_url)),
  ])
  const byId = Object.fromEntries((people || []).map((p) => [p.id, p]))
  const count = {}
  const mine = new Set()
  ;(reports || []).forEach((r) => {
    count[r.photo_id] = (count[r.photo_id] || 0) + 1
    if (r.reporter_id === userId) mine.add(r.photo_id)
  })

  return photos.map((p) => ({
    ...p,
    image_url: signed[p.image_url] || p.image_url,
    hidden: !!p.hidden,
    uploader: byId[p.user_id] || null,
    reports: count[p.id] || 0,
    reportedByMe: mine.has(p.id),
  }))
}

// Flag a photo. Resolves to true if it got auto-hidden (3+ reports).
export async function reportPhoto(photoId, reason) {
  const { data, error } = await supabase.rpc('report_photo', { p_photo: photoId, p_reason: reason || null })
  if (error) throw new Error(error.message)
  return data
}

// Host or uploader hides / restores a photo
export async function setPhotoHidden(photoId, hidden) {
  const { error } = await supabase.rpc('set_photo_hidden', { p_photo: photoId, p_hidden: hidden })
  if (error) throw new Error(error.message)
}

// ---------- Team challenges ----------

export const acceptChallenge = (activityId, teamName) =>
  supabase.rpc('accept_challenge', { p_activity: activityId, p_team: teamName })

// Host only: reopen the challenge
export const clearChallenge = (activityId) =>
  supabase.from('activities').update({ opponent_team: null, challenger_id: null }).eq('id', activityId)

// ---------- Reliability (pro events) ----------
// { [userId]: { joined, showed } } — only returns users the caller is allowed to see
export async function fetchReliability(userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase.rpc('reliability_scores', { p_users: ids })
  if (error) return {}
  return Object.fromEntries((data || []).map((r) => [r.user_id, { joined: r.joined, showed: r.showed }]))
}

// ---------- Waitlist (casual) + join requests (pro) ----------
const rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

// Casual + full -> joins the waitlist. Pro -> sends a request to the host. Resolves to 'waitlist' | 'request'.
export const requestJoin = (activityId) => rpc('request_join', { p_activity: activityId })
export const cancelRequest = (activityId) => rpc('cancel_request', { p_activity: activityId })
export const decideRequest = (activityId, userId, approve) =>
  rpc('decide_request', { p_activity: activityId, p_user: userId, p_approve: approve })
// Host only: pending requests with public stats
export const fetchRequestList = (activityId) => rpc('request_list', { p_activity: activityId })
// My place in line: { kind, status, position, waiting } or null
export const fetchMyRequest = (activityId) => rpc('my_request', { p_activity: activityId })
export const markRequestSeen = (activityId) => rpc('mark_request_seen', { p_activity: activityId })

// Things that happened to my requests that I haven't seen yet (moved in, approved, declined)
export async function fetchRequestUpdates(userId) {
  const { data, error } = await supabase
    .from('join_requests')
    .select('activity_id, kind, status, decided_at')
    .eq('user_id', userId)
    .eq('seen', false)
    .in('status', ['promoted', 'approved', 'denied'])
  if (error) return []
  return data || []
}

// Host: waiting requests / waitlist on my events -> { [activityId]: { request: n, waitlist: n } }
export async function fetchWaitingCounts(activityIds) {
  if (!activityIds.length) return {}
  const { data, error } = await supabase
    .from('join_requests')
    .select('activity_id, kind')
    .eq('status', 'waiting')
    .in('activity_id', activityIds)
  if (error) return {}
  const out = {}
  ;(data || []).forEach((r) => {
    out[r.activity_id] ||= { request: 0, waitlist: 0 }
    out[r.activity_id][r.kind] += 1
  })
  return out
}

// Host of a casual event: who's on the waitlist, in order
export async function fetchWaitlist(activityId) {
  const { data, error } = await supabase
    .from('join_requests')
    .select('user_id, created_at, profile:profiles(full_name, avatar_url, is_verified)')
    .eq('activity_id', activityId)
    .eq('kind', 'waitlist')
    .eq('status', 'waiting')
    .order('created_at')
  if (error) return []
  return data || []
}

// ---------- Follow ----------
// People you've been at an event with: [{ user_id, full_name, avatar_url, is_verified, games, last_played, following }]
export const fetchPlayedWith = () => rpc('played_with', {})
export const followUser = (userId) => rpc('follow_user', { p_user: userId })
export const unfollowUser = (userId) => rpc('unfollow_user', { p_user: userId })

// Ids of everyone I follow (Set)
export async function fetchFollowing(userId) {
  const { data, error } = await supabase.from('follows').select('followee_id').eq('follower_id', userId)
  if (error) return new Set()
  return new Set((data || []).map((r) => r.followee_id))
}
// People who follow me: [{ user_id, full_name, avatar_url, is_verified, since, following_back }]
export const fetchMyFollowers = () => rpc('my_followers', {})
export const removeFollower = (userId) => rpc('remove_follower', { p_user: userId })

// ---------- Direct messages (friends only) ----------
export const fetchDmThreads = () => rpc('dm_threads', {})
export const sendDm = (toId, body, activityId = null) => rpc('send_dm', { p_to: toId, p_body: body, p_activity: activityId })
export const markDmRead = (fromId) => rpc('mark_dm_read', { p_from: fromId })

export async function fetchConversation(me, other) {
  const { data, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, body, activity_id, created_at, read_at')
    .or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
    .order('created_at', { ascending: true })
    .limit(300)
  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchUnreadDmCount(me) {
  const { count, error } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me)
    .is('read_at', null)
  return error ? 0 : count || 0
}

// Calls back whenever someone sends me a message (Realtime). Returns an unsubscribe function.
// Several parts of the app listen at once (sidebar badge, conversation list, open chat), so they
// all share ONE channel. Supabase won't add listeners to a channel after it has subscribed.
const dmListeners = new Set()
let dmChannel = null

export function subscribeDms(me, callback) {
  dmListeners.add(callback)
  if (!dmChannel) {
    dmChannel = supabase
      .channel(`dm:${me}:${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${me}` },
        (p) => dmListeners.forEach((fn) => fn(p.new)))
      .subscribe()
  }
  return () => {
    dmListeners.delete(callback)
    if (!dmListeners.size && dmChannel) {
      supabase.removeChannel(dmChannel)
      dmChannel = null
    }
  }
}

// ---------- Profile picture ----------
// Centre-crops to a square, shrinks to 512px, uploads to avatars/<userId>/<time>.jpg,
// then saves the URL on the profile and on the login session (so the sidebar updates too).
async function squareJpeg(file, size = 512) {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error("Couldn't read that image"))
      i.src = url
    })
    const side = Math.min(img.width, img.height)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = Math.min(size, side)
    canvas.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function saveAvatarUrl(userId, avatarUrl) {
  const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', userId)
  if (error) throw new Error(error.message)
  await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } }) // refreshes session.user
}

async function clearOldAvatars(userId, keep) {
  const { data } = await supabase.storage.from('avatars').list(userId)
  const old = (data || []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep)
  if (old.length) await supabase.storage.from('avatars').remove(old)
}

export async function uploadAvatar(userId, file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image')
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is too big (max 15 MB)')
  const blob = await squareJpeg(file)
  const path = `${userId}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw new Error(error.message)
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  await saveAvatarUrl(userId, data.publicUrl)
  clearOldAvatars(userId, path).catch(() => {})
  return data.publicUrl
}

export async function removeAvatar(userId) {
  await saveAvatarUrl(userId, null)
  clearOldAvatars(userId, null).catch(() => {})
}

// ---------- Private details (DOB, gender) + eligibility ----------
// Only you can read your own row. Used to check age-group / women's / men's events.
export async function fetchMyDetails(userId) {
  const { data, error } = await supabase.from('private_details').select('birth_date, gender').eq('user_id', userId).maybeSingle()
  if (error) return null
  return data
}
export const setMyDetails = (birthDate, gender) => rpc('set_my_details', { p_birth: birthDate || null, p_gender: gender || null })
// null = you can join; otherwise the reason you can't
export const fetchMyEligibility = (activityId) => rpc('my_eligibility', { p_activity: activityId })
