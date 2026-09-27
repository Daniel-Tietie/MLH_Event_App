import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { ReliabilityBadge } from './Reliability'
import {
  cancelRequest, decideRequest, fetchMyRequest, fetchRequestList, fetchWaitlist, requestJoin,
} from '../services/activityService'
import { joinMode, spotsLeft, WAITLIST_CUTOFF_MIN } from '../utils/constants'

const LEVEL_LABEL = { casual: 'Casual', competitive: 'Competitive', d2: 'D2', d1: 'D1', professional: 'Pro', ex_player: 'Ex-player', retired: 'Retired' }
const ordinal = (n) => {
  const suf = ['th', 'st', 'nd', 'rd'], v = n % 100
  return n + (suf[(v - 20) % 10] || suf[v] || suf[0])
}

// Refreshes with the rest of the app (every 10 s) so a promotion shows up quickly
function usePoll(load, deps, ms = 10000) {
  useEffect(() => {
    load()
    const t = setInterval(load, ms)
    return () => clearInterval(t)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The main button for someone who isn't in the event yet.
 * Casual: Join -> (full) Join waitlist -> (30 min before) Full
 * Pro:    Request to join -> Waiting for host -> Approved (becomes a member) / Declined
 */
export function JoinButton({ activity: a, onJoin, notify, onChange }) {
  const [mine, setMine] = useState(undefined) // undefined = loading, null = no request
  const [busy, setBusy] = useState(false)
  const mode = joinMode(a)

  const load = useCallback(() => fetchMyRequest(a.id).then(setMine).catch(() => setMine(null)), [a.id])
  usePoll(load, [a.id])

  async function run(fn, msg) {
    setBusy(true)
    try {
      await fn()
      if (msg) notify(msg, 'success')
      await load()
      onChange?.()
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusy(false)
  }

  const waiting = mine?.status === 'waiting'

  if (waiting && mine.kind === 'request') {
    return (
      <>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => cancelRequest(a.id), 'Request cancelled')}>Cancel</button>
        <span className="pill pill-lg pill-wait"><Icon name="clock" size={16} /> Waiting for host</span>
      </>
    )
  }
  if (waiting && mine.kind === 'waitlist') {
    const tooLate = mode === 'full' || mode === 'started'
    return (
      <>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(() => cancelRequest(a.id), 'You left the waitlist')}>Leave</button>
        <span className="pill pill-lg pill-wait">
          {tooLate ? 'Waitlist closed' : `${ordinal(mine.position)} on the waitlist`}
        </span>
      </>
    )
  }
  if (mine?.status === 'denied' && mode === 'request') {
    return <button className="btn btn-wide" disabled>Request declined</button>
  }

  switch (mode) {
    case 'join':
      return <button className="btn btn-yellow btn-wide" onClick={() => onJoin(a.id)}>Join event</button>
    case 'waitlist':
      return (
        <button className="btn btn-dark btn-wide" disabled={busy} onClick={() => run(() => requestJoin(a.id), "You're on the waitlist. We'll move you in if a spot opens.")}>
          Join waitlist
        </button>
      )
    case 'request':
      return (
        <button className="btn btn-yellow btn-wide" disabled={busy} onClick={() => run(() => requestJoin(a.id), 'Request sent. The host will review it.')}>
          <Icon name="shield" size={18} /> Request to join
        </button>
      )
    case 'full':
      return <button className="btn btn-wide" disabled>Full · starts soon</button>
    case 'closed':
      return <button className="btn btn-wide" disabled>Sign-ups closed</button>
    default:
      return <button className="btn btn-wide" disabled>Started</button>
  }
}

// Line under the button explaining what happens next
export function JoinHint({ activity: a }) {
  const mode = joinMode(a)
  if (mode === 'request') return <p className="muted small join-hint">Pro event: the host reviews every request and picks the roster.</p>
  if (mode === 'waitlist') return <p className="muted small join-hint">It's full. If someone leaves more than {WAITLIST_CUTOFF_MIN} min before the start, the next person on the waitlist is moved in automatically.</p>
  return null
}

/** Host of a pro event: pending requests with the player's public stats */
export function RequestsPanel({ activity: a, notify, onChange, onCount }) {
  const [list, setList] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const full = spotsLeft(a) === 0

  const load = useCallback(
    () => fetchRequestList(a.id).then((l) => { setList(l || []); onCount?.((l || []).length) }).catch(() => setList([])),
    [a.id] // eslint-disable-line react-hooks/exhaustive-deps
  )
  usePoll(load, [a.id])

  async function decide(r, approve) {
    setBusyId(r.user_id)
    try {
      await decideRequest(a.id, r.user_id, approve)
      notify(approve ? `${r.full_name || 'Player'} is in` : 'Request declined', approve ? 'success' : 'info')
      await load()
      onChange?.()
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusyId(null)
  }

  if (list === null) return <p className="muted">Loading requests...</p>
  if (!list.length) {
    return (
      <div className="empty small">
        <div className="empty-icon">📨</div>
        <p className="muted">No pending requests. Players who ask to join will show up here.</p>
      </div>
    )
  }

  return (
    <div className="requests">
      <p className="muted small rel-hint">
        <Icon name="shield" size={16} />
        {full
          ? 'The event is full. Approving opens up again when someone leaves.'
          : `${spotsLeft(a)} spot${spotsLeft(a) === 1 ? '' : 's'} left. You only see players' public stats, not their personal info.`}
      </p>
      <ul className="people">
        {list.map((r) => (
          <li key={r.user_id} className="request-row">
            <Avatar name={r.full_name} url={r.avatar_url} size={44} />
            <div className="request-info">
              <strong>
                {r.full_name || 'Player'}
                {r.is_verified && <span className="verified"><Icon name="check" size={12} /> Verified</span>}
              </strong>
              <ReliabilityBadge stat={{ joined: r.pro_joined, showed: r.pro_showed }} />
              <div className="request-stats">
                <span>{r.games_played} game{r.games_played === 1 ? '' : 's'} played</span>
                {(r.sports || []).slice(0, 3).map((s) => (
                  <span key={s.name} className="sport-chip">{s.name} · {LEVEL_LABEL[s.level] || s.level}</span>
                ))}
              </div>
            </div>
            <div className="request-actions">
              <button className="btn btn-ghost btn-sm" disabled={busyId === r.user_id} onClick={() => decide(r, false)}>Deny</button>
              <button className="btn btn-dark btn-sm" disabled={busyId === r.user_id || full} onClick={() => decide(r, true)}>Approve</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Host of a casual event: who's waiting, in order */
export function WaitlistList({ activity: a }) {
  const [list, setList] = useState([])
  const load = useCallback(() => fetchWaitlist(a.id).then(setList), [a.id])
  usePoll(load, [a.id])
  if (!list.length) return null
  return (
    <>
      <h4 className="list-sub">Waitlist <span className="count">{list.length}</span></h4>
      <ul className="people">
        {list.map((w, i) => (
          <li key={w.user_id}>
            <span className="queue-no">{i + 1}</span>
            <Avatar name={w.profile?.full_name} url={w.profile?.avatar_url} size={36} />
            <div><strong>{w.profile?.full_name || 'Player'}</strong></div>
            <span className="pill">Waiting</span>
          </li>
        ))}
      </ul>
    </>
  )
}
