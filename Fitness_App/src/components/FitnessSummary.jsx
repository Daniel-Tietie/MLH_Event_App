import { useMemo, useState } from 'react'
import Icon from './Icon'
import { fmtDuration, fmtPace, simulatedWorkouts, weekSummary } from '../utils/fitnessSim'
import { formatDate, formatTime } from '../utils/constants'

/**
 * Fitness stats synced from the paired watch.
 * DEMO: the numbers are simulated from each event's real time and sport (no Apple / Google health access).
 * Real version: Apple HealthKit or Google Health Connect, only with the user's permission.
 */
export default function FitnessSummary({ activities, userId, deviceName, openEvent }) {
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState(() => Date.now())
  const [showAll, setShowAll] = useState(false)

  const workouts = useMemo(() => simulatedWorkouts(activities, userId), [activities, userId])
  const week = useMemo(() => weekSummary(workouts), [workouts])
  const maxKm = Math.max(1, ...week.days.map((d) => d.km))
  const list = showAll ? workouts : workouts.slice(0, 5)

  function sync() {
    setSyncing(true)
    setTimeout(() => { setSyncing(false); setSyncedAt(Date.now()) }, 1400)
  }

  return (
    <section className="section fit">
      <div className="section-head">
        <h2>Your fitness this week</h2>
        <button className="btn btn-ghost btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? <><span className="fit-spin" /> Syncing…</> : <>Synced {formatTime(new Date(syncedAt).toISOString())} · Sync now</>}
        </button>
      </div>

      <div className="fit-stats">
        <Stat icon="activity" label="Distance" value={`${week.km} km`} />
        <Stat icon="clock" label="Active time" value={fmtDuration(week.minutes)} />
        <Stat icon="heart" label="Avg heart rate" value={week.avgHr ? `${week.avgHr} bpm` : '–'} />
        <Stat icon="zap" label="Calories" value={`${week.kcal.toLocaleString()} kcal`} />
      </div>

      <div className="card fit-chart">
        <div className="fit-chart-head">
          <strong>Distance per day</strong>
          <span className="muted small">{week.count} workout{week.count === 1 ? '' : 's'} in the last 7 days</span>
        </div>
        <div className="fit-bars">
          {week.days.map((d, i) => (
            <div key={i} className="fit-bar-col" title={`${d.km.toFixed(1)} km`}>
              <span className="fit-bar-val">{d.km ? d.km.toFixed(1) : ''}</span>
              <span className="fit-bar" style={{ height: `${Math.max(4, (d.km / maxKm) * 100)}%` }} data-empty={!d.km || undefined} />
              <span className="fit-bar-day">{i === 6 ? 'Today' : d.date.toLocaleDateString([], { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-head fit-list-head">
        <h3>Workouts</h3>
        <span className="muted small">From {deviceName}</span>
      </div>
      <ul className="fit-list">
        {list.map((w) => (
          <li key={w.id} className="card">
            <span className="fit-icon">{w.icon}</span>
            <div className="fit-main">
              <strong>
                {w.title}
                {w.source === 'event' && (
                  <button className="fit-tag" onClick={() => openEvent(w.id)}>Rally event</button>
                )}
              </strong>
              <span className="muted small">
                {formatDate(new Date(w.start).toISOString())} · {formatTime(new Date(w.start).toISOString())} – {formatTime(new Date(w.end).toISOString())}
              </span>
            </div>
            <dl className="fit-metrics">
              {w.km > 0.5 && <div><dt>Distance</dt><dd>{w.km} km</dd></div>}
              {w.pace ? <div><dt>Pace</dt><dd>{fmtPace(w.pace)}</dd></div>
                : w.speed ? <div><dt>Speed</dt><dd>{w.speed.toFixed(1)} km/h</dd></div> : null}
              <div><dt>Time</dt><dd>{fmtDuration(w.minutes)}</dd></div>
              <div><dt>Heart rate</dt><dd>{w.avgHr} <small>avg</small></dd></div>
              <div><dt>Calories</dt><dd>{w.kcal}</dd></div>
            </dl>
          </li>
        ))}
      </ul>
      {workouts.length > 5 && (
        <button className="link-btn" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : `Show all ${workouts.length}`}</button>
      )}
      <p className="muted small watch-privacy">
        <Icon name="shield" size={14} /> Demo: workouts are simulated from your event times. The real version reads Apple Health or Google Health Connect, only with your permission, and nothing is shared with your group unless you turn it on.
      </p>
    </section>
  )
}

function Stat({ icon, label, value }) {
  return (
    <div className="card fit-stat">
      <span className="fit-stat-icon"><Icon name={icon} size={18} /></span>
      <span className="muted small">{label}</span>
      <strong>{value}</strong>
    </div>
  )
}
