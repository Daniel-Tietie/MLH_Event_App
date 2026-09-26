import { AvatarStack } from './Avatar'
import { activePeople, eventPhase, formatDate, formatTime, sportColors, sportIcon, spotsLeft } from '../utils/constants'

// Compact event row (like the calendar list items in the reference design)
export default function EventCard({ activity: a, onOpen, distance, role }) {
  const sport = a.sport?.name || 'Sport'
  const [bg] = sportColors(sport)
  const people = activePeople(a)
  const left = spotsLeft(a)
  const isPro = a.category === 'professional'

  return (
    <article className="ecard" onClick={() => onOpen?.(a.id)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.(a.id)}>
      <div className="ecard-icon" style={{ background: bg }}>{sportIcon(sport)}</div>

      <div className="ecard-body">
        <div className="ecard-head">
          <h3>{a.title || 'Untitled event'}</h3>
          {role && <span className={`pill ${role === 'host' ? 'pill-host' : 'pill-green'}`}>{role === 'host' ? 'Hosting' : 'Joined'}</span>}
          {a.status !== 'open' && <span className={`status status-${a.status}`}>{a.status}</span>}
        </div>

        <p className="ecard-sub">
          {sport} · {a.city}
          {distance != null && <> · <strong>{distance < 1 ? '<1' : distance.toFixed(1)} km</strong></>}
        </p>

        <div className="ecard-tags">
          <span className={`time-pill ${isPro ? 'pro' : ''}`}>
            {formatDate(a.starts_at)} · {formatTime(a.starts_at)}
          </span>
          {isPro && <span className="tag tag-pro">PRO</span>}
          {a.type === 'team' && <span className="tag tag-team">Team vs Team</span>}
          {a.night_mode && <span className="tag tag-night">🌙 Night</span>}
          {eventPhase(a) === 'live' && new Date(a.starts_at) <= new Date() && <span className="tag tag-live">● Live now</span>}
        </div>

        <div className="ecard-foot">
          <AvatarStack people={people} size={26} />
          <span className={`spots ${left <= 2 ? 'low' : ''}`}>
            {left === 0 ? 'Full' : `${left} spot${left === 1 ? '' : 's'} left`}
          </span>
        </div>
      </div>
    </article>
  )
}
