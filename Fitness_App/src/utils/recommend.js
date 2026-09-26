import { spotsLeft } from './constants'

const COMPETITIVE = ['competitive', 'professional', 'd1', 'd2', 'ex_player']
const LEVEL_LABEL = {
  casual: 'casual',
  competitive: 'competitive',
  professional: 'pro',
  d1: 'D1',
  d2: 'D2',
  ex_player: 'ex-player',
  retired: 'retired',
}

/**
 * Picks upcoming events that fit you, best first.
 *  mySports: [{ sportId, name, level }] from your profile
 *  city:     your profile city
 * Each result gets `reasons` (short "why this" chips).
 */
export function recommend(activities, { userId, mySports = [], city = '' }) {
  const now = Date.now()
  const levelBySport = Object.fromEntries(mySports.map((s) => [s.sportId, s.level]))
  const myCity = city.trim().toLowerCase()

  return activities
    .filter(
      (a) =>
        a.status === 'open' &&
        a.host_id !== userId &&
        new Date(a.starts_at) > now &&
        !a.people.some((p) => p.user_id === userId && p.status !== 'left')
    )
    .map((a) => {
      let score = 0
      const reasons = []
      const level = levelBySport[a.sport?.id]

      if (level) {
        score += 5
        reasons.push(`You play ${a.sport.name}`)
      }
      if (a.category === 'professional') {
        if (level && COMPETITIVE.includes(level)) {
          score += 3
          reasons.push(`Fits your ${LEVEL_LABEL[level]} level`)
        } else {
          score -= 4 // pro game but you play casually
        }
      } else if (level) {
        score += 1
      }
      if (myCity && a.city?.trim().toLowerCase() === myCity) {
        score += 2
        reasons.push(`In ${a.city}`)
      }
      const days = (new Date(a.starts_at) - now) / 864e5
      if (days < 3) {
        score += 1
        reasons.push(days < 1 ? 'Happening soon' : 'This week')
      }
      const left = spotsLeft(a)
      if (left > 0 && left <= 2) reasons.push(`Only ${left} spot${left === 1 ? '' : 's'} left`)

      return { ...a, score, reasons: reasons.slice(0, 2) }
    })
    .filter((a) => a.score >= 5)
    .sort((x, y) => y.score - x.score || new Date(x.starts_at) - new Date(y.starts_at))
    .slice(0, 8)
}
