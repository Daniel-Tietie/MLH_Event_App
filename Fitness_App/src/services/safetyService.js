import { supabase } from '../lib/supabaseClient'

// ---------- Emergency contacts (private to each user) ----------

export async function fetchContacts() {
  const { data, error } = await supabase.from('trusted_contacts').select('id, name, phone').order('name')
  if (error) throw new Error(error.message)
  return data || []
}

export async function addContact(userId, name, phone) {
  const { error } = await supabase.from('trusted_contacts').insert({ user_id: userId, name, phone })
  if (error) throw new Error(error.message)
}

export async function removeContact(id) {
  const { error } = await supabase.from('trusted_contacts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---------- Safety check-ins ----------

// status: 'safe' | 'need_help' | 'no_response' | 'checked_out' (left / got home)
export const recordSafety = (activityId, userId, status) =>
  supabase.from('safety_checkins').insert({ activity_id: activityId, user_id: userId, status })

// ---------- Event end time ----------

export function extendEvent(activityId, endsAt, minutes = 30) {
  const base = Math.max(Date.now(), endsAt ? new Date(endsAt).getTime() : Date.now())
  return supabase
    .from('activities')
    .update({ ends_at: new Date(base + minutes * 60e3).toISOString() })
    .eq('id', activityId)
}

export const endEvent = (activityId) =>
  supabase.from('activities').update({ status: 'completed' }).eq('id', activityId)

// ---------- Live channel (instant ping / status / SOS between devices) ----------

export function joinSafetyChannel(activityId, handlers) {
  const channel = supabase.channel(`safety:${activityId}`, { config: { broadcast: { self: false } } })
  channel
    .on('broadcast', { event: 'ping' }, ({ payload }) => handlers.onPing?.(payload))
    .on('broadcast', { event: 'status' }, ({ payload }) => handlers.onStatus?.(payload))
    .on('broadcast', { event: 'sos' }, ({ payload }) => handlers.onSos?.(payload))
    .on('broadcast', { event: 'ended' }, ({ payload }) => handlers.onEnded?.(payload))
    .subscribe()

  return {
    send: (event, payload) => channel.send({ type: 'broadcast', event, payload }),
    leave: () => supabase.removeChannel(channel),
  }
}

// Events (from this list) where the user already confirmed they got home safe
export async function fetchSafeCheckouts(userId, activityIds) {
  if (!activityIds.length) return new Set()
  const { data, error } = await supabase
    .from('safety_checkins')
    .select('activity_id')
    .eq('user_id', userId)
    .in('status', ['safe', 'checked_out'])
    .in('activity_id', activityIds)
  if (error) throw new Error(error.message)
  return new Set((data || []).map((r) => r.activity_id))
}

// Latest safety status per person for one event (the host sees everyone, members see themselves)
export async function fetchEventCheckins(activityId) {
  const { data, error } = await supabase
    .from('safety_checkins')
    .select('user_id, status, created_at')
    .eq('activity_id', activityId)
    .order('created_at')
  if (error) return {}
  const latest = {}
  ;(data || []).forEach((r) => { latest[r.user_id] = r.status })
  return latest
}
