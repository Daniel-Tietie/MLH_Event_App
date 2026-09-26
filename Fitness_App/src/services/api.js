// Data layer for Rally. Every function the UI needs goes through this file.
// Names and return shapes are camelCase and stable, so components never see raw database rows.
import { supabase } from '../lib/supabaseClient'

const FREDERICTON = { lat: 45.9636, lng: -66.6431 }

// ---------- helpers ----------

// Supabase returns { data, error }. Throw a readable Error so the UI can show error.message.
function unwrap({ data, error }) {
  if (error) throw new Error(friendlyError(error))
  return data
}

function friendlyError(error) {
  if (error.code === '23505') return 'You have already joined this activity'
  if (error.code === '42501' || /row-level security/i.test(error.message)) return 'You are not allowed to do that'
  return error.message // the cap trigger raises "This activity is full" / "This activity is closed"
}

async function requireUserId() {
  const { data } = await supabase.auth.getSession()
  const id = data.session?.user?.id
  if (!id) throw new Error('Please sign in first')
  return id
}

// PostGIS wants WKT: POINT(lng lat). Note the order is longitude first.
const toPoint = (lat, lng) => `SRID=4326;POINT(${lng} ${lat})`
const toLine = (coords) => `SRID=4326;LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(', ')})`

function toActivity(r) {
  return {
    id: r.id,
    hostId: r.host_id,
    hostName: r.host_name,
    hostVerified: r.host_verified,
    sportId: r.sport_id,
    sport: r.sport_name,
    title: r.title,
    description: r.description,
    type: r.type, // 'casual' | 'team'
    opponentTeam: r.opponent_team,
    city: r.city,
    address: r.address,
    startsAt: r.starts_at,
    maxParticipants: r.max_participants,
    joinedCount: r.joined_count,
    spotsLeft: r.spots_left,
    status: r.status, // 'open' | 'closed' | 'cancelled' | 'completed'
    nightMode: r.night_mode,
    corridorRadiusM: r.corridor_radius_m,
    checkinIntervalS: r.checkin_interval_s,
    lat: r.lat,
    lng: r.lng,
    distanceKm: r.distance_km == null ? undefined : Math.round(r.distance_km * 10) / 10,
    // route as [[lat, lng], ...] for Leaflet (GeoJSON is [lng, lat], so flip)
    route: r.route_geojson ? r.route_geojson.coordinates.map(([lng, lat]) => [lat, lng]) : null,
  }
}

// ---------- auth ----------

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }, // the DB trigger reads this to create the profile row
  })
  if (error) throw new Error(error.message)
  return { user: data.user, session: data.session }
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return { user: data.user, session: data.session }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getCurrentUser() {
  const { data } = await supabase.auth.getSession()
  return data.session?.user ?? null
}

// Calls back on login/logout so the UI can react. Returns an unsubscribe function.
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null))
  return () => data.subscription.unsubscribe()
}

// ---------- profiles and sports ----------

export async function getSports() {
  const rows = unwrap(await supabase.from('sports').select('id, name').order('name'))
  return rows // [{ id, name }]
}

// getProfile() = the signed-in user; getProfile(id) = anyone
export async function getProfile(userId) {
  const id = userId ?? (await requireUserId())
  const p = unwrap(
    await supabase.from('profiles').select('id, full_name, avatar_url, bio, city, is_verified').eq('id', id).single()
  )
  const sports = unwrap(await supabase.from('user_sports').select('level, sports(id, name)').eq('user_id', id))
  return {
    id: p.id,
    fullName: p.full_name,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    city: p.city,
    isVerified: p.is_verified,
    sports: sports.map((s) => ({ sportId: s.sports.id, name: s.sports.name, level: s.level })),
  }
}

export async function updateProfile({ fullName, bio, city, avatarUrl }) {
  const id = await requireUserId()
  const patch = {}
  if (fullName !== undefined) patch.full_name = fullName
  if (bio !== undefined) patch.bio = bio
  if (city !== undefined) patch.city = city
  if (avatarUrl !== undefined) patch.avatar_url = avatarUrl
  unwrap(await supabase.from('profiles').update(patch).eq('id', id))
  return getProfile(id)
}

// sports = [{ sportId, level }]  level: casual | competitive | professional | d1 | d2 | ex_player | retired
export async function setUserSports(sports) {
  const id = await requireUserId()
  unwrap(await supabase.from('user_sports').delete().eq('user_id', id))
  if (sports.length) {
    unwrap(await supabase.from('user_sports').insert(sports.map((s) => ({ user_id: id, sport_id: s.sportId, level: s.level }))))
  }
  return getProfile(id)
}

// MOCK: there is no real ID check. It only flips a flag, and no ID document is ever stored.
export async function verifyIdentityMock() {
  const id = await requireUserId()
  unwrap(await supabase.from('profiles').update({ is_verified: true }).eq('id', id))
  return getProfile(id)
}

// ---------- activities ----------

// Open activities within radiusKm of a point, soonest first. Optional client-side filters: sportId, type.
export async function getActivities({ lat = FREDERICTON.lat, lng = FREDERICTON.lng, radiusKm = 10, sportId, type } = {}) {
  const rows = unwrap(await supabase.rpc('activities_nearby', { p_lat: lat, p_lng: lng, p_radius_km: radiusKm }))
  return rows
    .map(toActivity)
    .filter((a) => (sportId ? a.sportId === sportId : true) && (type ? a.type === type : true))
}

// One activity with its participant list. Includes route (night walks) and lat/lng.
export async function getActivity(activityId) {
  const row = unwrap(await supabase.from('activity_details').select('*').eq('id', activityId).single())
  const participants = await getParticipants(activityId)
  return { ...toActivity(row), participants }
}

// startsAt: ISO string. route (optional, night walks): [[lat, lng], ...]
export async function createActivity({
  sportId, title, description, type = 'casual', opponentTeam, city, address,
  lat, lng, startsAt, maxParticipants, nightMode = false, route, corridorRadiusM, checkinIntervalS,
}) {
  const hostId = await requireUserId()
  const row = {
    host_id: hostId,
    sport_id: sportId,
    title,
    description,
    type,
    opponent_team: opponentTeam,
    city,
    address,
    location: toPoint(lat, lng),
    starts_at: startsAt,
    max_participants: maxParticipants,
    night_mode: nightMode,
  }
  if (route?.length >= 2) row.route = toLine(route)
  if (corridorRadiusM) row.corridor_radius_m = corridorRadiusM
  if (checkinIntervalS) row.checkin_interval_s = checkinIntervalS
  const created = unwrap(await supabase.from('activities').insert(row).select('id').single())
  return getActivity(created.id)
}

// Host can close a listing early. (The database closes it automatically when it fills.)
export async function closeActivity(activityId) {
  unwrap(await supabase.from('activities').update({ status: 'closed' }).eq('id', activityId))
  return getActivity(activityId)
}

export async function getMyActivities() {
  const uid = await requireUserId()
  const hosting = unwrap(await supabase.from('activity_details').select('*').eq('host_id', uid).order('starts_at'))
  const joinedRows = unwrap(await supabase.from('activity_participants').select('activity_id, status').eq('user_id', uid))
  let joined = []
  if (joinedRows.length) {
    const details = unwrap(
      await supabase.from('activity_details').select('*').in('id', joinedRows.map((r) => r.activity_id)).order('starts_at')
    )
    const statusById = Object.fromEntries(joinedRows.map((r) => [r.activity_id, r.status]))
    joined = details.map((d) => ({ ...toActivity(d), myStatus: statusById[d.id] })) // myStatus: 'joined' | 'checked_in'
  }
  return { hosting: hosting.map(toActivity), joined }
}

// ---------- joining, leaving, check-in ----------

// The cap is enforced in the database. Full or closed listings throw "This activity is full/closed".
// Goes through join_activity() because users are not allowed to read qr_token from the table directly.
export async function joinActivity(activityId) {
  const qrToken = unwrap(await supabase.rpc('join_activity', { p_activity: activityId }))
  return { activityId, status: 'joined', qrToken }
}

export async function leaveActivity(activityId) {
  unwrap(await supabase.rpc('leave_activity', { p_activity: activityId }))
  return { activityId }
}

// participants = [{ userId, fullName, avatarUrl, status }]  (no QR tokens)
export async function getParticipants(activityId) {
  const rows = unwrap(
    await supabase.from('activity_participants').select('user_id, status, profiles(full_name, avatar_url)').eq('activity_id', activityId).neq('status', 'left')
  )
  return rows.map((r) => ({
    userId: r.user_id,
    fullName: r.profiles?.full_name,
    avatarUrl: r.profiles?.avatar_url,
    status: r.status, // 'joined' | 'checked_in'
  }))
}

// The token to encode as this user's QR code, or null if they haven't joined. Only ever returns your own.
export async function getMyQrToken(activityId) {
  return unwrap(await supabase.rpc('my_qr_token', { p_activity: activityId }))
}

// Host scans a QR. Returns { name } of the attendee. Throws if the token is invalid or the caller is not the host.
export async function checkIn(qrToken) {
  const name = unwrap(await supabase.rpc('check_in', { p_token: qrToken }))
  return { name }
}

// ---------- comments ----------

export async function getComments(activityId) {
  const rows = unwrap(
    await supabase.from('comments').select('id, body, created_at, user_id, profiles(full_name, avatar_url)').eq('activity_id', activityId).order('created_at')
  )
  return rows.map((c) => ({
    id: c.id, body: c.body, createdAt: c.created_at, userId: c.user_id,
    authorName: c.profiles?.full_name, authorAvatarUrl: c.profiles?.avatar_url,
  }))
}

export async function addComment(activityId, body) {
  const uid = await requireUserId()
  unwrap(await supabase.from('comments').insert({ activity_id: activityId, user_id: uid, body }))
  return getComments(activityId)
}

// ---------- group chat (Realtime) ----------

export async function getMessages(activityId) {
  const rows = unwrap(
    await supabase.from('messages').select('id, body, created_at, sender_id, profiles(full_name, avatar_url)').eq('activity_id', activityId).order('created_at')
  )
  return rows.map((m) => ({
    id: m.id, body: m.body, createdAt: m.created_at, senderId: m.sender_id,
    senderName: m.profiles?.full_name, senderAvatarUrl: m.profiles?.avatar_url,
  }))
}

export async function sendMessage(activityId, body) {
  const uid = await requireUserId()
  unwrap(await supabase.from('messages').insert({ activity_id: activityId, sender_id: uid, body }))
}

// callback gets { id, body, createdAt, senderId } for each new message. Returns an unsubscribe function.
export function subscribeToMessages(activityId, callback) {
  const channel = supabase
    .channel(`chat:${activityId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `activity_id=eq.${activityId}` }, (payload) => {
      const m = payload.new
      callback({ id: m.id, body: m.body, createdAt: m.created_at, senderId: m.sender_id })
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---------- live location and geofence (night walks) ----------

// Latest position of everyone sharing on this activity: [{ userId, fullName, lat, lng, updatedAt }]
export async function getLiveLocations(activityId) {
  const rows = unwrap(await supabase.from('live_positions').select('*').eq('activity_id', activityId))
  return rows.map((r) => ({ userId: r.user_id, fullName: r.full_name, lat: r.lat, lng: r.lng, updatedAt: r.updated_at }))
}

// Upsert my position. The database raises a geofence alert if it is outside the route corridor.
export async function shareLocation(activityId, lat, lng) {
  const uid = await requireUserId()
  unwrap(
    await supabase.from('live_locations').upsert(
      { activity_id: activityId, user_id: uid, position: toPoint(lat, lng), updated_at: new Date().toISOString() },
      { onConflict: 'activity_id,user_id' }
    )
  )
}

export async function stopSharingLocation(activityId) {
  const uid = await requireUserId()
  unwrap(await supabase.from('live_locations').delete().eq('activity_id', activityId).eq('user_id', uid))
}

// Realtime sends positions as raw geography, so on any change we re-read the view. Returns an unsubscribe function.
export function subscribeToLocations(activityId, callback) {
  const refresh = () => getLiveLocations(activityId).then(callback).catch(() => {})
  const channel = supabase
    .channel(`live:${activityId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'live_locations', filter: `activity_id=eq.${activityId}` }, refresh)
    .subscribe()
  refresh()
  return () => supabase.removeChannel(channel)
}

export async function getGeofenceAlerts(activityId) {
  const rows = unwrap(
    await supabase.from('geofence_alerts').select('id, user_id, meters_outside, created_at, profiles(full_name)').eq('activity_id', activityId).order('created_at', { ascending: false })
  )
  return rows.map((a) => ({ id: a.id, userId: a.user_id, fullName: a.profiles?.full_name, metersOutside: Math.round(a.meters_outside), createdAt: a.created_at }))
}

export function subscribeToGeofenceAlerts(activityId, callback) {
  const channel = supabase
    .channel(`alerts:${activityId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'geofence_alerts', filter: `activity_id=eq.${activityId}` }, (payload) => {
      callback({ id: payload.new.id, userId: payload.new.user_id, metersOutside: Math.round(payload.new.meters_outside), createdAt: payload.new.created_at })
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}
