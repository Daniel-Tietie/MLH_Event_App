// Change the app name here and it updates everywhere
export const APP_NAME = 'Rally'
export const TAGLINE = 'Play more. Meet your people.'

// Map starts here if the browser won't share location
export const DEFAULT_CENTER = { lat: 45.9636, lng: -66.6431 } // Fredericton, NB

const SPORT_ICONS = {
  cycling: '🚴', running: '🏃', basketball: '🏀', hiking: '🥾', badminton: '🏸',
  tennis: '🎾', football: '⚽', soccer: '⚽', 'flag football': '🏈', rugby: '🏉',
  volleyball: '🏐', swimming: '🏊', yoga: '🧘', climbing: '🧗', hockey: '🏒',
}
export const sportIcon = (name = '') => SPORT_ICONS[name.toLowerCase()] || '🏅'

// Pastel pairs used for sport tiles and event icons
const PASTELS = [
  ['#fde9a9', '#cfdcff'],
  ['#f8cfdc', '#fde0c8'],
  ['#cdeedd', '#cfdcff'],
  ['#dcd3ff', '#f8cfdc'],
  ['#fde0c8', '#cdeedd'],
  ['#cfdcff', '#fde9a9'],
]
export function sportColors(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PASTELS[h % PASTELS.length]
}

export function initials(name = '') {
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
}

export const activePeople = (a) => (a.people || []).filter((p) => p.status !== 'left')
export const spotsLeft = (a) => Math.max(a.max_participants - activePeople(a).length, 0)

export const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
export const formatDate = (iso) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
export const formatLong = (iso) =>
  `${new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatTime(iso)}`

export function isNightTime(iso) {
  if (!iso) return false
  const h = new Date(iso).getHours()
  return h >= 20 || h < 6
}

// "2026-09-27" in local time (used to group events by calendar day)
export function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Sports where people move along a path (route tracking). Everything else happens at a venue.
const MOVING_SPORTS = ['cycling', 'running', 'hiking', 'walking', 'trail running', 'skiing', 'rollerblading', 'skating', 'rowing', 'kayaking']
export const isMovingSport = (name = '') => MOVING_SPORTS.includes(name.toLowerCase())

// Live GPS tracking only for casual moving activities (people carry phones on runs/rides/hikes).
// Games and pro events use check-in mode: QR on arrival, SOS, and "home safe" at the end.
export const isTracked = (a) => isMovingSport(a?.sport?.name) && a?.category !== 'professional'

// ---------- Event timing ----------
// Safety tools open 30 min before the start and stay live until the end
// (plus 30 min grace, so late-running games aren't cut off). The host can end early or extend.
export const SAFETY_OPENS_MIN = 30

export function eventEnd(a) {
  const start = new Date(a.starts_at).getTime()
  return a.ends_at ? new Date(a.ends_at).getTime() : start + 2 * 3600e3
}

// 'upcoming' | 'live' | 'ended' | 'cancelled'
export function eventPhase(a) {
  if (!a) return 'upcoming'
  if (a.status === 'cancelled') return 'cancelled'
  const now = Date.now()
  const start = new Date(a.starts_at).getTime()
  if (a.status === 'completed' || now > eventEnd(a) + 30 * 60e3) return 'ended'
  if (now >= start - SAFETY_OPENS_MIN * 60e3) return 'live'
  return 'upcoming'
}

// Still on the schedule? (not completed, cancelled, or past its end time)
export const isNotOver = (a) => {
  const phase = eventPhase(a)
  return phase === 'upcoming' || phase === 'live'
}
