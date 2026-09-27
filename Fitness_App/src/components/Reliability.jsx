import { useEffect, useState } from 'react'
import { fetchReliability } from '../services/activityService'

// Needs this many finished pro events before we show a percentage
const MIN_EVENTS = 1

export function reliabilityLevel(stat) {
  if (!stat || stat.joined < MIN_EVENTS) return { tone: 'new', pct: null }
  const pct = Math.round((stat.showed / stat.joined) * 100)
  return { tone: pct >= 85 ? 'good' : pct >= 60 ? 'ok' : 'bad', pct }
}

// Small pill: "Shows up 92% · 11/12 pro"
export function ReliabilityBadge({ stat, compact }) {
  const { tone, pct } = reliabilityLevel(stat)
  if (tone === 'new') {
    return <span className="rel-badge rel-new" title="No finished pro events yet">New · no pro history</span>
  }
  return (
    <span className={`rel-badge rel-${tone}`} title={`Checked in to ${stat.showed} of ${stat.joined} pro events they joined`}>
      {compact ? `${pct}%` : `Shows up ${pct}%`} · {stat.showed}/{stat.joined} pro
    </span>
  )
}

// Loads scores for a list of users (re-fetches when the list changes)
export function useReliability(userIds, enabled = true) {
  const [stats, setStats] = useState({})
  const key = [...new Set(userIds)].sort().join(',')
  useEffect(() => {
    if (!enabled || !key) return setStats({})
    let alive = true
    fetchReliability(key.split(',')).then((s) => alive && setStats(s))
    return () => { alive = false }
  }, [key, enabled])
  return stats
}
