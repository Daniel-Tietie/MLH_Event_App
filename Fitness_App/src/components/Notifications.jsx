import Icon from './Icon'
import { formatTime, sportColors, sportIcon } from '../utils/constants'

/**
 * Top-right notifications:
 *  - timeups: host's events that reached their end time -> End or +30 min
 *  - homeChecks: "Did you get home safe?" after events you attended
 *  - items:   "How was <event>? Leave a comment" after events you attended
 */
export default function Notifications({ timeups = [], timeupActions, homeChecks = [], homeActions, items = [], onOpen, onDismiss }) {
  if (!timeups.length && !homeChecks.length && !items.length) return null
  // Ask about getting home safe before asking for comments
  const commentItems = items.filter((a) => !homeChecks.some((h) => h.id === a.id))

  return (
    <div className="notif-stack" role="region" aria-label="Notifications">
      {timeups.slice(0, 2).map((a) => (
        <div key={`t-${a.id}`} className="notif notif-timeup">
          <span className="notif-icon" style={{ background: '#ffe7d6' }}>⏰</span>
          <div className="notif-body">
            <strong>Time's up for {a.title}</strong>
            <p>It was planned to end at {formatTime(a.ends_at)}. Still going?</p>
            <div className="notif-actions">
              <button className="btn btn-dark btn-sm" onClick={() => timeupActions.end(a)}>End event</button>
              <button className="btn btn-yellow btn-sm" onClick={() => timeupActions.extend(a)}>+30 min</button>
            </div>
          </div>
          <button className="notif-close" onClick={() => timeupActions.snooze(a)} aria-label="Remind me in 10 minutes">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}

      {homeChecks.slice(0, 2).map((a) => (
        <div key={`h-${a.id}`} className="notif notif-home">
          <span className="notif-icon" style={{ background: 'var(--green-soft)' }}>🏠</span>
          <div className="notif-body">
            <strong>Did you get home safe?</strong>
            <p>{a.title} has ended. Let the group know you're OK.</p>
            <div className="notif-actions">
              <button className="btn btn-safe btn-sm" onClick={() => homeActions.safe(a)}>I'm safe</button>
              <button className="btn btn-ghost btn-sm" onClick={() => homeActions.help(a)}>I need help</button>
            </div>
          </div>
        </div>
      ))}

      {commentItems.slice(0, 2).map((a) => (
        <div key={a.id} className="notif">
          <span className="notif-icon" style={{ background: sportColors(a.sport?.name)[0] }}>
            {sportIcon(a.sport?.name)}
          </span>
          <div className="notif-body">
            <strong>How was {a.title}?</strong>
            <p>Leave a comment for the group 🙌</p>
            <div className="notif-actions">
              <button className="btn btn-yellow btn-sm" onClick={() => onOpen(a.id)}>Comment</button>
              <button className="btn btn-ghost btn-sm" onClick={() => onDismiss(a.id)}>Later</button>
            </div>
          </div>
          <button className="notif-close" onClick={() => onDismiss(a.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
