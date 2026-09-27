// Change the app name here and it updates everywhere
export const APP_NAME = 'Rally'
export const TAGLINE = 'Play more. Meet your people.'

// Map starts here if the browser won't share location
export const DEFAULT_CENTER = { lat: 45.9636, lng: -66.6431 } // Fredericton, NB

const SPORT_ICONS = {
  cycling: '🚴', running: '🏃', basketball: '🏀', hiking: '🥾', badminton: '🏸',
  tennis: '🎾', football: '⚽', soccer: '⚽', 'flag football': '🏈', rugby: '🏉',
  volleyball: '🏐', swimming: '🏊', yoga: '🧘', climbing: '🧗', hockey: '🏒',
  pickleball: '🏓', 'table tennis': '🏓', squash: '🎾', golf: '⛳', 'ultimate frisbee': '🥏',
  'disc golf': '🥏', baseball: '⚾', softball: '🥎', cricket: '🏏', 'ice skating': '⛸️',
  walking: '🚶', 'trail running': '🏃', skiing: '⛷️', kayaking: '🛶', rowing: '🚣',
  skateboarding: '🛹', boxing: '🥊', 'martial arts': '🥋', dance: '💃', 'gym workout': '🏋️',
  bowling: '🎳', spikeball: '🏐',
}
export const sportIcon = (name = '') => SPORT_ICONS[name.toLowerCase()] || '🏅'

// Person emojis that come in women's / men's versions (🚶 -> 🚶‍♀️ / 🚶‍♂️)
const PERSON_EMOJI = ['🏃', '🚴', '🚶', '🏊', '🧘', '🧗', '🚣', '🏋️']
// Icon for an event: a women's or men's event shows the matching person emoji
export function eventIcon(a) {
  const base = sportIcon(a?.sport?.name)
  if (!PERSON_EMOJI.includes(base)) return base
  if (a?.gender_rule === 'women') return `${base}\u200D\u2640\uFE0F`
  if (a?.gender_rule === 'men') return `${base}\u200D\u2642\uFE0F`
  return base
}

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

// ---------- Joining ----------
// Casual waitlist stops moving people in this close to the start (not enough time to get there)
export const WAITLIST_CUTOFF_MIN = 30

// How a non-member can get into this event:
// 'join' | 'waitlist' | 'request' | 'full' (too late for waitlist) | 'closed' (host closed) | 'started'
export function joinMode(a) {
  if (!a || a.status === 'cancelled' || a.status === 'completed' || Date.now() >= new Date(a.starts_at).getTime()) return 'started'
  const hostClosed = a.status === 'closed' && !a.closed_by_cap
  if (hostClosed) return 'closed'
  if (a.category === 'professional') return 'request'
  if (a.status === 'open' && spotsLeft(a) > 0) return 'join'
  const cutoff = new Date(a.starts_at).getTime() - WAITLIST_CUTOFF_MIN * 60e3
  return Date.now() < cutoff ? 'waitlist' : 'full'
}

// ---------- Who can join ----------
export const GENDER_RULES = [
  ['open', 'Everyone'],
  ['women', "Women's"],
  ['men', "Men's"],
  ['women_nb', 'Women & non-binary'],
]
export const AGE_GROUPS = [
  ['', 'All ages (18+)'],
  ['18-25', '18–25'],
  ['26-35', '26–35'],
  ['30-', '30+'],
  ['40-', '40+'],
  ['50-', '50+'],
  ['60-', '60+'],
]
export const GENDER_OPTIONS = [
  ['', 'Optional'],
  ['woman', 'Woman'],
  ['man', 'Man'],
  ['non_binary', 'Non-binary'],
  ['prefer_not', 'Prefer not to say'],
]
export const isRestricted = (a) => (a?.gender_rule && a.gender_rule !== 'open') || a?.age_min || a?.age_max

// Short labels for an event's restrictions, e.g. ["Women's", "50+"]
export function eligibilityTags(a) {
  const tags = []
  const g = GENDER_RULES.find(([k]) => k === a?.gender_rule)
  if (g && g[0] !== 'open') tags.push(g[1])
  if (a?.age_min || a?.age_max) tags.push(a.age_max ? `${a.age_min || 18}–${a.age_max}` : `${a.age_min}+`)
  return tags
}

// Latest birth date that's still 18 today, as YYYY-MM-DD (for the date picker's max)
export function adultCutoff() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 18)
  return d.toISOString().slice(0, 10)
}
