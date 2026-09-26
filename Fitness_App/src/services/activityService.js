import { supabase } from '../lib/supabaseClient'

// All database calls live here. Each returns { data, error } like Supabase does.

export function fetchActivities() {
  return supabase
    .from('activities')
    .select(`
      id, host_id, title, description, type, category, opponent_team, city, address,
      location, starts_at, max_participants, status, night_mode,
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

  const [{ data: events, error: e3 }, { data: reviews, error: e4 }] = await Promise.all([
    supabase.from('activities').select('id, title, starts_at, city, sport:sports(name)').in('id', ids).order('starts_at', { ascending: false }),
    supabase.from('comments').select('activity_id, body, created_at').eq('user_id', userId).in('activity_id', ids),
  ])
  if (e3 || e4) throw new Error((e3 || e4).message)

  const reviewBy = Object.fromEntries((reviews || []).map((r) => [r.activity_id, r.body]))
  return (events || []).map((e) => ({
    ...e,
    sport: e.sport?.name,
    role: hostedIds.has(e.id) ? 'host' : 'attended',
    review: reviewBy[e.id] || null,
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
