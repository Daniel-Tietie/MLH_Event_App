import { supabase } from '../lib/supabaseClient'

// All database calls live here. Each returns { data, error } like Supabase does.

export function fetchActivities() {
  return supabase
    .from('activities')
    .select(`
      id, host_id, title, description, type, category, opponent_team, city, address,
      location, starts_at, ends_at, max_participants, status, night_mode,
      sport:sports(id, name),
      host:profiles!host_id(full_name, avatar_url, is_verified),
      activity_participants(user_id, status, checked_in_at)
    `)
    .order('starts_at')
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
  const photosBy = {}
  ;(photos || []).forEach((p) => (photosBy[p.activity_id] ||= []).push(p.image_url))
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

export async function fetchActivityPhotos(activityId) {
  const { data, error } = await supabase
    .from('activity_photos')
    .select('id, image_url, user_id, created_at')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// ---------- Team challenges ----------

export const acceptChallenge = (activityId, teamName) =>
  supabase.rpc('accept_challenge', { p_activity: activityId, p_team: teamName })

// Host only: reopen the challenge
export const clearChallenge = (activityId) =>
  supabase.from('activities').update({ opponent_team: null, challenger_id: null }).eq('id', activityId)
