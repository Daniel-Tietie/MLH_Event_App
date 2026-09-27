// DEMO ONLY: simulated smartwatch fitness data.
// There's no Apple Health / Health Connect access in a hackathon, so we generate believable,
// repeatable numbers from each event's real start/end time and sport (same event = same numbers).

import { activePeople, sportIcon } from './constants'

// Small seeded random generator so numbers don't jump around on every refresh
function seeded(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19))
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}
const between = (r, lo, hi) => lo + r() * (hi - lo)

// km/h range + heart-rate range + calories per minute, by kind of sport
const PROFILES = {
  run: { speed: [9.2, 12], hr: [142, 162], kcal: [10, 13], label: 'Run' },
  cycle: { speed: [20, 28], hr: [128, 150], kcal: [8, 11], label: 'Ride' },
  hike: { speed: [3.4, 4.8], hr: [108, 128], kcal: [6, 8], label: 'Hike' },
  walk: { speed: [4.6, 5.6], hr: [96, 112], kcal: [4, 5.5], label: 'Walk' },
  swim: { speed: [2, 3], hr: [125, 145], kcal: [8, 10], label: 'Swim' },
  court: { speed: [3, 5.5], hr: [132, 158], kcal: [8, 11], label: 'Game' },
  studio: { speed: [0, 0], hr: [95, 120], kcal: [3.5, 6], label: 'Session' },
}
function kindOf(sport = '') {
  const s = sport.toLowerCase()
  if (s.includes('run')) return 'run'
  if (s.includes('cycl') || s === 'rowing' || s === 'kayaking') return 'cycle'
  if (s.includes('hik')) return 'hike'
  if (s.includes('walk')) return 'walk'
  if (s.includes('swim')) return 'swim'
  if (['yoga', 'dance', 'gym workout', 'climbing', 'bowling', 'boxing', 'martial arts'].includes(s)) return 'studio'
  return 'court'
}

function makeWorkout({ id, title, sport, start, end, source }) {
  const r = seeded(id)
  const p = PROFILES[kindOf(sport)]
  const minutes = Math.max(10, Math.round((end - start) / 60000))
  const km = +(between(r, ...p.speed) * (minutes / 60)).toFixed(1)
  const avgHr = Math.round(between(r, ...p.hr))
  return {
    id, title, sport, source,
    icon: sportIcon(sport),
    kind: p.label,
    start, end, minutes,
    km,
    pace: km > 0.5 && kindOf(sport) === 'run' ? (minutes / km) : null, // min per km
    speed: km > 0.5 ? km / (minutes / 60) : null,
    avgHr,
    maxHr: avgHr + Math.round(between(r, 12, 26)),
    kcal: Math.round(minutes * between(r, ...p.kcal)),
    steps: kindOf(sport) === 'cycle' || kindOf(sport) === 'swim' ? null : Math.round(minutes * between(r, 95, 150)),
  }
}

// Workouts for the last 14 days: your Rally events (real times) + a few recorded straight on the watch
export function simulatedWorkouts(activities, userId) {
  const now = Date.now()
  const since = now - 14 * 86400e3
  const fromEvents = activities
    .filter((a) => {
      const start = new Date(a.starts_at).getTime()
      const mine = a.host_id === userId || activePeople(a).some((p) => p.user_id === userId)
      return mine && a.status !== 'cancelled' && start <= now && start >= since
    })
    .map((a) => {
      const start = new Date(a.starts_at).getTime()
      const end = Math.min(a.ends_at ? new Date(a.ends_at).getTime() : start + 2 * 3600e3, now)
      return makeWorkout({ id: a.id, title: a.title, sport: a.sport?.name, start, end, source: 'event' })
    })

  // A few everyday workouts so the summary isn't empty before your first event
  const r = seeded(`watch-${userId}`)
  const extras = [
    { d: 1, h: 7, m: 35, sport: 'Running', title: 'Morning run' },
    { d: 3, h: 18, m: 50, sport: 'Walking', title: 'Evening walk' },
    { d: 5, h: 8, m: 60, sport: 'Cycling', title: 'Weekend ride' },
    { d: 9, h: 17, m: 40, sport: 'Running', title: 'After-work run' },
  ].map((w) => {
    const day = new Date(now - w.d * 86400e3)
    day.setHours(w.h, Math.round(r() * 50), 0, 0)
    const start = day.getTime()
    return makeWorkout({ id: `watch-${userId}-${w.d}`, title: w.title, sport: w.sport, start, end: start + w.m * 60000, source: 'watch' })
  })

  return [...fromEvents, ...extras].sort((a, b) => b.start - a.start)
}

// Totals for the last 7 days + km per day (oldest -> today)
export function weekSummary(workouts) {
  const now = new Date()
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    return { date: d, km: 0, minutes: 0 }
  })
  const weekStart = days[0].date.getTime()
  const week = workouts.filter((w) => w.start >= weekStart)
  week.forEach((w) => {
    const idx = Math.floor((w.start - weekStart) / 86400e3)
    if (days[idx]) { days[idx].km += w.km; days[idx].minutes += w.minutes }
  })
  return {
    days,
    km: +week.reduce((s, w) => s + w.km, 0).toFixed(1),
    minutes: week.reduce((s, w) => s + w.minutes, 0),
    kcal: week.reduce((s, w) => s + w.kcal, 0),
    count: week.length,
    avgHr: week.length ? Math.round(week.reduce((s, w) => s + w.avgHr, 0) / week.length) : 0,
  }
}

export const fmtPace = (minPerKm) => `${Math.floor(minPerKm)}:${String(Math.round((minPerKm % 1) * 60)).padStart(2, '0')} /km`
export const fmtDuration = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`)
