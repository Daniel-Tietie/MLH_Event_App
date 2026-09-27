import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import { Avatar } from '../components/Avatar'
import GroupRadar from '../components/GroupRadar'
import { endEvent, fetchContacts, fetchEventCheckins, joinSafetyChannel, recordSafety } from '../services/safetyService'
import { activePeople, DEFAULT_CENTER, eventPhase, formatTime, isTracked, SAFETY_OPENS_MIN } from '../utils/constants'
import { groupOffset } from '../utils/simulation'
import '../styles/safety.css'

// How often the app silently checks that everyone is still with the group.
// Nobody gets a popup unless they've drifted too far.
const INTERVALS = [
  [30, 'Every 30 sec (demo)'],
  [60, 'Every 1 min (demo)'],
  [300, 'Every 5 min'],
  [900, 'Every 15 min'],
]
const RESPONSE_WINDOW_MS = 20000 // time to answer "Are you OK?"

/**
 * Safety screen. Opens 30 min before the event and stays live until it ends.
 *
 * Two modes:
 *  - Live tracking (casual runs, rides, hikes, walks): group radar, too-far alerts, smart check-ins
 *    (automatic while you're with the group; you're only asked if you drift too far)
 *  - Check-in mode (games, pro events): no tracking, phones can stay in bags.
 *    QR check-in on arrival, SOS any time, "home safe" check-out when the event ends.
 *
 * Drop-outs:
 *  - Left before the event -> not listed (they're no longer a participant)
 *  - Never showed up       -> "Not arrived", not on the radar, never triggers alerts
 *  - Leaves partway        -> "Leaving early" checks them out, tells the group, removes them from the radar
 */
export default function LiveSafetyPage(props) {
  const { event, data, goBack } = props
  if (!event) {
    return (
      <div className="page">
        <button className="icon-btn icon-btn-pink" onClick={goBack}><Icon name="back" /></button>
        <p className="muted" style={{ marginTop: 20 }}>{data.loading ? 'Loading...' : 'Event not found.'}</p>
      </div>
    )
  }

  const phase = eventPhase(event)
  if (phase === 'upcoming' || phase === 'cancelled') {
    const opens = new Date(new Date(event.starts_at).getTime() - SAFETY_OPENS_MIN * 60e3).toISOString()
    return (
      <div className="page">
        <button className="icon-btn icon-btn-pink" onClick={goBack} aria-label="Back"><Icon name="back" /></button>
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="empty-icon"><Icon name="shield" size={26} /></div>
          <h3>{phase === 'cancelled' ? 'This event was cancelled' : 'Safety opens closer to the event'}</h3>
          {phase === 'upcoming' && (
            <p className="muted">Check-ins, the group radar and SOS open at {formatTime(opens)}, 30 minutes before the start.</p>
          )}
        </div>
      </div>
    )
  }
  return <LiveSession key={event.id} {...props} a={event} phase={phase} />
}

function LiveSession({ session, a, phase, notify, goBack, data }) {
  const userId = session.user.id
  const myName = session.user.user_metadata?.full_name || 'Someone'
  const isHost = a.host_id === userId
  const people = activePeople(a)
  const joined = people.some((p) => p.user_id === userId)
  const allowed = isHost || joined
  const tracked = isTracked(a)
  const ended = phase === 'ended'
  const center = a.coords || DEFAULT_CENTER

  const [radius, setRadius] = useState(60) // metres from the group before someone is flagged
  const [intervalSec, setIntervalSec] = useState(60)
  const [elapsed, setElapsed] = useState(0)
  const [now, setNow] = useState(Date.now())
  const [nextAt, setNextAt] = useState(() => Date.now() + 60e3)
  // userId -> safe | auto | pending | need_help | no_response | checked_out
  const [statuses, setStatuses] = useState({})
  const statusRef = useRef(statuses)
  statusRef.current = statuses
  const [feed, setFeed] = useState([])
  const [breaches, setBreaches] = useState(0)
  const [prompt, setPrompt] = useState(null) // { deadline, ended, far }
  const [sosOpen, setSosOpen] = useState(false)
  const [contacts, setContacts] = useState([])
  const outside = useRef(new Set())
  const channel = useRef(null)

  const addFeed = useCallback((type, text) => {
    setFeed((f) => [{ id: Math.random().toString(36).slice(2), at: Date.now(), type, text }, ...f].slice(0, 30))
  }, [])

  // Pick up anyone who already checked out / pressed SOS before this screen opened
  useEffect(() => {
    fetchEventCheckins(a.id).then((latest) => {
      const keep = Object.fromEntries(Object.entries(latest).filter(([, st]) => st === 'checked_out' || st === 'need_help'))
      if (Object.keys(keep).length) setStatuses((s) => ({ ...keep, ...s }))
    })
  }, [a.id])

  // ---------- Who's here: the real host + attendees of THIS event ----------
  // Live tracking: everyone attending is on the radar (their movement is simulated for the demo).
  // Check-in mode: people count as "arrived" once the host scans their QR code.
  const peopleKey = people.map((p) => `${p.user_id}:${p.status}`).join(',')
  const roster = useMemo(() => {
    const list = [{ id: a.host_id, name: isHost ? 'You' : a.host?.full_name || 'Host', isHost: true, isMe: isHost, present: true }]
    people.forEach((p) => {
      if (p.user_id === a.host_id) return
      const isMe = p.user_id === userId
      list.push({
        id: p.user_id,
        name: isMe ? 'You' : p.profile?.full_name || 'Player',
        isMe,
        qr: p.status === 'checked_in',
        present: tracked || isMe || p.status === 'checked_in',
      })
    })
    // Demo: one real attendee (not you, not the host) wanders off now and then to show the alert
    const wanderer = tracked ? [...list].reverse().find((m) => !m.isMe && !m.isHost) : null
    return list.map((m, idx) => ({ ...m, idx, wanderer: wanderer?.id === m.id }))
  }, [a.host_id, peopleKey, userId, tracked]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Clock ----------
  useEffect(() => {
    const t = setInterval(() => {
      setElapsed((e) => e + 0.5)
      setNow(Date.now())
    }, 500)
    return () => clearInterval(t)
  }, [])

  // ---------- Who's actively being watched + distance from the group (simulated for the demo) ----------
  const active = useMemo(
    () => roster.filter((m) => m.present && statuses[m.id] !== 'checked_out'),
    [roster, statuses]
  )
  const positions = useMemo(() => {
    if (!tracked || ended) return active.map((m) => ({ ...m, outside: false }))
    return active.map((m) => {
      const o = groupOffset(m.idx, elapsed, { isHost: m.isHost, isWanderer: m.wanderer })
      return { ...m, x: o.x, y: o.y, dist: o.dist, outside: o.dist > radius }
    })
  }, [elapsed, active, radius, tracked, ended])
  const posRef = useRef(positions)
  posRef.current = positions

  // ---------- Check-ins ----------
  const respond = useCallback((member, status) => {
    setStatuses((s) => ({ ...s, [member.id]: status }))
    if (status === 'safe') addFeed('ok', `${member.name} checked in safe`)
    if (status === 'need_help') addFeed('danger', `🚨 ${member.name} needs help`)
  }, [addFeed])

  // Ask ONE person "Are you OK?" (used when they drift too far)
  const askOne = useCallback((m) => {
    setStatuses((s) => (s[m.id] === 'need_help' ? s : { ...s, [m.id]: 'pending' }))
    if (m.isMe) setPrompt({ deadline: Date.now() + RESPONSE_WINDOW_MS, far: Math.round(m.dist) })
    setTimeout(() => {
      if (m.isMe || statusRef.current[m.id] !== 'pending') return
      addFeed('danger', `No response from ${m.name}. Their emergency contacts would be alerted.`)
      setStatuses((s) => ({ ...s, [m.id]: 'no_response' }))
    }, RESPONSE_WINDOW_MS + 2000)
  }, [addFeed])

  // Too-far alerts
  useEffect(() => {
    positions.forEach((m) => {
      if (m.outside && !outside.current.has(m.id)) {
        outside.current.add(m.id)
        setBreaches((b) => b + 1)
        addFeed('danger', `${m.name} is ${Math.round(m.dist)} m from the group. Asking them to check in.`)
        askOne(m)
      } else if (!m.outside && outside.current.has(m.id)) {
        outside.current.delete(m.id)
        addFeed('ok', `${m.name} is back with the group`)
      }
    })
  }, [positions, addFeed, askOne])

  const runCheckin = useCallback((source) => {
    const list = posRef.current

    // Smart automatic check-in: people with the group are marked safe silently, no popup
    if (source === 'auto') {
      const withGroup = list.filter((m) => !m.outside)
      setStatuses((s) => {
        const next = { ...s }
        withGroup.forEach((m) => { if (!['need_help', 'pending'].includes(next[m.id])) next[m.id] = 'auto' })
        return next
      })
      addFeed('info', `Auto check-in: ${withGroup.length} with the group ✓`)
      list.filter((m) => m.outside).forEach((m) => askOne(m))
      return
    }

    // Host "Ping everyone": asks every active member directly
    setStatuses((s) => {
      const next = { ...s }
      list.forEach((m) => { if (next[m.id] !== 'need_help') next[m.id] = 'pending' })
      return next
    })
    addFeed('info', 'Host pinged everyone for a safety check-in')
    if (allowed && statusRef.current[userId] !== 'checked_out') setPrompt({ deadline: Date.now() + RESPONSE_WINDOW_MS })

    // Anyone still silent after the window is flagged
    setTimeout(() => {
      const silent = posRef.current.filter((m) => !m.isMe && statusRef.current[m.id] === 'pending')
      if (!silent.length) return
      silent.forEach((m) => addFeed('danger', `No response from ${m.name}. Their emergency contacts would be alerted.`))
      setStatuses((s) => {
        const next = { ...s }
        silent.forEach((m) => { next[m.id] = 'no_response' })
        return next
      })
    }, RESPONSE_WINDOW_MS + 2000)
  }, [addFeed, allowed, askOne, userId])
  const runCheckinRef = useRef(runCheckin)
  runCheckinRef.current = runCheckin

  // Automatic check-ins: live tracking only, and only while the event is running
  useEffect(() => {
    if (tracked && !ended && now >= nextAt) {
      runCheckin('auto')
      setNextAt(Date.now() + intervalSec * 1000)
    }
  }, [now, nextAt, intervalSec, runCheckin, tracked, ended])
  useEffect(() => setNextAt(Date.now() + intervalSec * 1000), [intervalSec])

  // My answer
  function answer(status) {
    const wasEnded = prompt?.ended
    setPrompt(null)
    const me = roster.find((m) => m.isMe)
    if (me) respond(me, status)
    recordSafety(a.id, userId, status)
    channel.current?.send('status', { userId, name: myName, status })
    if (status === 'need_help') openSos()
    if (status === 'safe' && (wasEnded || ended)) checkOut('home')
  }

  // Leaving early / heading home: stop watching me, tell the group, skip the "home safe?" prompt later
  function checkOut(reason = 'early') {
    setPrompt(null)
    setStatuses((s) => ({ ...s, [userId]: 'checked_out' }))
    recordSafety(a.id, userId, 'checked_out')
    channel.current?.send('status', { userId, name: myName, status: 'checked_out', reason })
    notify(reason === 'early' ? 'Checked out early. Get home safe! 👋' : 'Checked out. Get home safe! 👋', 'success')
    goBack()
  }

  // Missed my own check-in
  useEffect(() => {
    if (prompt && now > prompt.deadline) {
      setPrompt(null)
      setStatuses((s) => ({ ...s, [userId]: 'no_response' }))
      recordSafety(a.id, userId, 'no_response')
      channel.current?.send('status', { userId, name: myName, status: 'no_response' })
      addFeed('danger', 'You missed a check-in. Your emergency contacts would be alerted.')
    }
  }, [now, prompt]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Live channel: pings, statuses, SOS and "event ended" from other devices ----------
  useEffect(() => {
    channel.current = joinSafetyChannel(a.id, {
      onPing: () => runCheckinRef.current('ping'),
      onStatus: ({ userId: id, name, status, reason }) => {
        setStatuses((s) => ({ ...s, [id]: status }))
        if (status === 'safe') addFeed('ok', `${name} checked in safe`)
        if (status === 'no_response') addFeed('danger', `${name} missed a check-in`)
        if (status === 'checked_out') addFeed('ok', reason === 'early' ? `${name} left early and is heading home ✓` : `${name} checked out, heading home ✓`)
      },
      onSos: ({ name }) => {
        addFeed('danger', `🚨 SOS from ${name}`)
        notify(`🚨 SOS from ${name}`, 'error')
      },
      onEnded: () => {
        addFeed('info', 'The host ended the event')
        if (statusRef.current[userId] !== 'checked_out') setPrompt({ deadline: Date.now() + 60000, ended: true })
      },
    })
    return () => channel.current?.leave()
  }, [a.id, addFeed, notify, userId])

  function pingEveryone() {
    channel.current?.send('ping', { from: myName })
    runCheckin('ping')
  }

  // ---------- SOS ----------
  useEffect(() => {
    fetchContacts().then(setContacts).catch(() => setContacts([]))
  }, [])

  function openSos() {
    setSosOpen(true)
    setStatuses((s) => ({ ...s, [userId]: 'need_help' }))
    recordSafety(a.id, userId, 'need_help')
    channel.current?.send('sos', { userId, name: myName })
    addFeed('danger', '🚨 You pressed SOS. The group has been alerted.')
  }

  function cancelSos() {
    setSosOpen(false)
    answer('safe')
  }

  async function finishEvent() {
    const { error } = await endEvent(a.id)
    if (error) return notify(error.message, 'error')
    channel.current?.send('ended', { from: myName })
    addFeed('info', 'You ended the event. Everyone is asked to confirm they got home safe.')
    notify('Event ended. Everyone will be asked to check out safely.', 'success')
    data.reload()
  }

  // ---------- Render ----------
  if (!allowed) {
    return (
      <div className="page">
        <button className="icon-btn icon-btn-pink" onClick={goBack}><Icon name="back" /></button>
        <div className="empty" style={{ marginTop: 20 }}>
          <div className="empty-icon"><Icon name="shield" size={26} /></div>
          <h3>Safety is for the group</h3>
          <p className="muted">Join this event to see check-ins and the SOS screen.</p>
        </div>
      </div>
    )
  }

  const myLoc = `${center.lat},${center.lng}` // demo: the meeting point. Real app: the phone's GPS
  const sosText = encodeURIComponent(`SOS from ${myName} at "${a.title}". My location: https://maps.google.com/?q=${myLoc}`)
  const secondsLeft = Math.max(0, Math.ceil((nextAt - now) / 1000))
  const outsideNow = positions.filter((m) => m.outside)
  const arrivedCount = roster.filter((m) => m.isHost || m.qr || (m.isMe && m.present)).length
  const realCount = roster.length
  const checkedOutCount = roster.filter((m) => statuses[m.id] === 'checked_out' || (ended && statuses[m.id] === 'safe')).length
  const radarMembers = tracked
    ? positions.map((m) => ({
        id: m.id,
        name: m.isHost && !m.isMe ? `${m.name} (host)` : m.name,
        x: m.x,
        y: m.y,
        state: statuses[m.id] === 'need_help' ? 'sos' : m.outside ? 'outside' : m.isMe ? 'me' : m.isHost ? 'host' : 'inside',
        showLabel: m.isMe || m.isHost || m.outside || statuses[m.id] === 'need_help',
      }))
    : []

  function memberStatus(m) {
    const st = statuses[m.id]
    const pos = positions.find((p) => p.id === m.id)
    if (st === 'need_help') return ['SOS', 'bad']
    if (st === 'checked_out') return [ended ? 'Home safe ✓' : 'Left early ✓', 'good']
    if (!m.present) return ['Not arrived', 'wait']
    if (pos?.outside) return ['Too far', 'bad']
    if (st === 'no_response') return ['No response', 'bad']
    if (st === 'pending') return ['Waiting...', 'wait']
    if (st === 'safe') return [ended ? 'Home safe' : 'Safe', 'good']
    if (st === 'auto') return ['Safe · auto', 'good']
    if (tracked && !ended) return ['With group', 'good']
    if (m.isHost) return ['Host', 'good']
    return ['Arrived ✓', 'good']
  }

  const hostControls = isHost && !ended && (
    <div className={tracked ? 'night-controls' : 'basic-controls'}>
      {tracked && (
        <>
          <label>
            <span>Automatic check-ins</span>
            <select value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))}>
              {INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label>
            <span>Alert if farther than: <strong>{radius} m</strong></span>
            <input type="range" min="20" max="140" step="10" value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
          </label>
        </>
      )}
      <div className="night-ping">
        <div>
          <strong>Ping everyone now</strong>
          <p>{tracked ? "Ask every member to confirm they're safe" : 'Good for breaks or if someone seems missing'}</p>
        </div>
        <button className="btn btn-primary" onClick={pingEveryone}>Ping</button>
      </div>
      <button className="btn btn-ghost-dark" onClick={finishEvent}>End event and ask everyone to check out</button>
    </div>
  )

  const myStatus = statuses[userId]

  return (
    <div className="page live">
      <header className="live-head">
        <button className="icon-btn icon-btn-pink" onClick={goBack} aria-label="Back"><Icon name="back" /></button>
        <div className="live-title">
          <p className="eyebrow">{tracked ? 'Live safety' : 'Safety'}</p>
          <h1>{a.title}</h1>
        </div>
        <div className="live-pills">
          {ended ? (
            <span className="pill">Ended</span>
          ) : tracked ? (
            <>
              <span className="live-badge"><i /> LIVE</span>
              <span className="pill">Demo movement</span>
            </>
          ) : (
            <span className="pill pill-host">Check-in mode</span>
          )}
        </div>
      </header>

      {ended && (
        <div className="ended-banner">
          <Icon name="check" size={18} />
          <span>This event has ended. Tap <strong>I'm heading home</strong> once you're on your way.</span>
        </div>
      )}

      <div className="live-grid">
        {tracked && !ended ? (
          <section className="night-card">
            <div className="night-map">
              <GroupRadar members={radarMembers} radiusM={radius} />
              <span className="night-mode">{a.night_mode ? 'Night monitoring' : 'Group radar'}</span>
              <div className="night-legend">
                <span><i className="lg-green" /> With the group</span>
                <span><i className="lg-red" /> Too far</span>
                <span><i className="lg-blue" /> You</span>
                <span><i className="lg-yellow" /> Host</span>
              </div>
            </div>

            <div className="night-stats">
              <div><span>On the radar</span><strong>{positions.length}</strong></div>
              <div><span>Next auto-check</span><strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</strong></div>
              <div><span>Distance alerts</span><strong className={breaches ? 'danger' : ''}>{breaches}</strong></div>
            </div>

            {isHost ? hostControls : (
              <p className="night-note">
                You're checked in automatically while you're with the group. You'll only be asked if you drift more than {radius} m away.
              </p>
            )}
          </section>
        ) : (
          <section className="card basic-card">
            <h3>{ended ? 'Checking everyone out' : `How safety works for this ${a.type === 'team' ? 'game' : 'event'}`}</h3>
            {!ended && <p className="muted small">{tracked ? '' : 'No live tracking here, so phones can stay in your bag while you play.'}</p>}
            {!ended && (
              <ol className="safety-steps">
                <li><span>1</span><div><strong>Check in on arrival</strong><p>The host scans your QR code, so everyone knows who's really there.</p></div></li>
                <li><span>2</span><div><strong>SOS any time</strong><p>Alerts the group and opens 911 and your emergency contacts.</p></div></li>
                <li><span>3</span><div><strong>Check out when you leave</strong><p>Leaving early or heading home, one tap tells the group you're OK.</p></div></li>
              </ol>
            )}
            <div className="basic-stats">
              <div><strong>{arrivedCount}/{realCount}</strong><span>arrived</span></div>
              <div><strong>{checkedOutCount}</strong><span>checked out safe</span></div>
            </div>
            {hostControls}
          </section>
        )}

        <aside className="live-side">
          {outsideNow.length > 0 && (
            <div className="alert-card">
              <Icon name="shield" size={20} />
              <div>
                <strong>{outsideNow.map((m) => m.name).join(', ')} {outsideNow.length > 1 ? 'are' : 'is'} too far from the group</strong>
                <p>{Math.round(outsideNow[0].dist)} m away (limit {radius} m)</p>
              </div>
            </div>
          )}

          <div className="card side-card">
            <h3>Members</h3>
            <ul className="member-list">
              {roster.map((m) => {
                const [label, tone] = memberStatus(m)
                return (
                  <li key={m.id} className={statuses[m.id] === 'checked_out' || !m.present ? 'dim' : ''}>
                    <Avatar name={m.name === 'You' ? myName : m.name} size={34} />
                    <span className="member-name">
                      {m.name}
                      {m.isHost && <small> · host</small>}
                      {m.qr && <small> · QR ✓</small>}
                    </span>
                    <span className={`member-status ${tone}`}>{label}</span>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="card side-card">
            <h3>Activity</h3>
            {feed.length === 0 ? (
              <p className="muted small">Alerts and check-ins will appear here.</p>
            ) : (
              <ul className="feed">
                {feed.map((f) => (
                  <li key={f.id} className={f.type}>
                    <time>{formatTime(new Date(f.at).toISOString())}</time>
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card safety-actions">
            {myStatus === 'checked_out' ? (
              <p className="checked-out-note"><Icon name="check" size={18} /> You've checked out. Get home safe!</p>
            ) : ended ? (
              <button className="btn btn-safe" onClick={() => checkOut('home')}>
                <Icon name="check" size={20} /> I'm heading home
              </button>
            ) : (
              <button className="btn btn-safe" onClick={() => answer('safe')}>
                <Icon name="check" size={20} /> I'm safe
              </button>
            )}
            <button className="btn btn-sos" onClick={openSos}>SOS</button>
            {!isHost && !ended && myStatus !== 'checked_out' && (
              <button className="btn btn-ghost leave-early" onClick={() => checkOut('early')}>
                Leaving early? Check out
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* "Are you OK?" prompt */}
      {prompt && (
        <div className="modal-backdrop">
          <div className="modal checkin-modal">
            <div className="checkin-ring" style={{ '--p': Math.max(0, (prompt.deadline - now) / (prompt.ended ? 60000 : RESPONSE_WINDOW_MS)) }}>
              <span>{Math.max(0, Math.ceil((prompt.deadline - now) / 1000))}</span>
            </div>
            <h3>{prompt.ended ? 'The event has ended' : prompt.far ? "You've left the group" : 'Safety check-in'}</h3>
            <p className="muted">
              {prompt.ended
                ? 'Are you heading home safe? Let the group know.'
                : prompt.far
                  ? `You're ${prompt.far} m from the group. Are you OK? If you don't answer, your emergency contacts will be alerted.`
                  : "Are you OK? If you don't answer, your emergency contacts will be alerted."}
            </p>
            <button className="btn btn-safe btn-block btn-lg" onClick={() => (prompt.ended ? checkOut('home') : answer('safe'))}>
              <Icon name="check" size={20} /> {prompt.ended ? "I'm heading home safe" : "I'm OK"}
            </button>
            {prompt.far && !isHost && (
              <button className="btn btn-ghost btn-block" onClick={() => checkOut('early')}>I'm leaving early</button>
            )}
            <button className="btn btn-sos btn-block" onClick={() => answer('need_help')}>I need help</button>
          </div>
        </div>
      )}

      {/* SOS sheet */}
      {sosOpen && (
        <div className="modal-backdrop">
          <div className="modal sos-modal">
            <div className="sos-icon">🚨</div>
            <h3>Emergency</h3>
            <p className="muted small">Your group has been alerted{tracked ? ' with your location' : ''}.</p>

            <a className="btn btn-sos btn-block btn-lg" href="tel:911">Call 911</a>

            <div className="sos-contacts">
              <p className="sos-label">Your emergency contacts</p>
              {contacts.length === 0 ? (
                <p className="muted small">None saved yet. Add them in My profile.</p>
              ) : (
                contacts.map((c) => (
                  <div key={c.id} className="sos-contact">
                    <div>
                      <strong>{c.name}</strong>
                      <span>{c.phone}</span>
                    </div>
                    <a className="btn btn-dark btn-sm" href={`tel:${c.phone}`}>Call</a>
                    <a className="btn btn-yellow btn-sm" href={`sms:${c.phone}?&body=${sosText}`}>Text location</a>
                  </div>
                ))
              )}
            </div>

            <button className="btn btn-ghost btn-block" onClick={cancelSos}>I'm OK now, cancel SOS</button>
          </div>
        </div>
      )}
    </div>
  )
}
