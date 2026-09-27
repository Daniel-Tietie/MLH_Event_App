import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import MapView from '../components/MapView'
import { Avatar, AvatarStack } from '../components/Avatar'
import ChatPanel from '../components/ChatPanel'
import Comments from '../components/Comments'
import ChallengeBox from '../components/ChallengeBox'
import { activePeople, eventEnd, eventPhase, formatLong, formatTime, isTracked, SAFETY_OPENS_MIN, sportColors, sportIcon, spotsLeft } from '../utils/constants'
import '../styles/safety.css'
import '../styles/detail.css'

export default function EventDetailPage({ session, event: a, data, actions, notify, onBack, focus, onCommented, openLive }) {
  const [tab, setTab] = useState('overview')

  // Opened from a "leave a comment" notification: jump to the comment box
  useEffect(() => {
    if (focus !== 'comments' || !a) return
    setTab('overview')
    const t = setTimeout(() => {
      const el = document.getElementById('comments')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.querySelector('input')?.focus()
    }, 250)
    return () => clearTimeout(t)
  }, [focus, a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo(
    () => (a?.coords ? [{ id: a.id, ...a.coords, icon: sportIcon(a.sport?.name), title: a.title }] : []),
    [a?.id, a?.coords?.lat, a?.coords?.lng] // eslint-disable-line react-hooks/exhaustive-deps
  )

  if (!a) {
    return (
      <div className="page">
        <button className="icon-btn icon-btn-pink" onClick={onBack}><Icon name="back" /></button>
        <p className="muted" style={{ marginTop: 24 }}>{data.loading ? 'Loading event...' : 'Event not found.'}</p>
      </div>
    )
  }

  const userId = session.user.id
  const sport = a.sport?.name || 'Sport'
  const [c1, c2] = sportColors(sport)
  const people = activePeople(a)
  const me = people.find((p) => p.user_id === userId)
  const isHost = a.host_id === userId
  const left = spotsLeft(a)
  const mapsUrl = a.coords ? `https://www.google.com/maps/search/?api=1&query=${a.coords.lat},${a.coords.lng}` : null

  return (
    <div className="page detail">
      <button className="icon-btn icon-btn-pink" onClick={onBack} aria-label="Back">
        <Icon name="back" />
      </button>

      <div className="detail-hero">
        <div className="hero-inner" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
          <span className="hero-blob" style={{ background: c1 }} />
        </div>
        <span className="hero-emoji">{sportIcon(sport)}</span>
        <div className="hero-tags">
          <span className="tag tag-solid">{sport}</span>
          {a.category === 'professional' && <span className="tag tag-pro">PRO</span>}
          {a.type === 'team' && <span className="tag tag-team">Team vs Team</span>}
          {a.night_mode && <span className="tag tag-night">🌙 Night</span>}
        </div>
        <span className={`status status-${a.status} hero-status`}>{a.status}</span>
      </div>

      <h1 className="detail-title">{a.title}</h1>

      <ul className="detail-meta">
        <li><Icon name="pin" size={18} />{[a.address, a.city].filter(Boolean).join(', ')}</li>
        <li><Icon name="calendar" size={18} />{formatLong(a.starts_at)}{a.ends_at && ` – ${formatTime(a.ends_at)}`}</li>
        <li>
          <Icon name="user" size={18} />
          Hosted by {isHost ? 'you' : a.host?.full_name || 'Unknown'}
          {a.host?.is_verified && <span className="verified"><Icon name="check" size={12} /> Verified</span>}
        </li>
      </ul>

      {a.type === 'team' && (
        <ChallengeBox activity={a} isHost={isHost} ended={eventPhase(a) === 'ended'} notify={notify} onChange={data.reload} />
      )}

      <div className="tabs">
        {[['overview', 'Overview'], ['people', `People (${people.length})`], ['chat', 'Chat'], ['map', 'Map']].map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="tab-body">
          <p className="detail-desc">{a.description || 'No description yet. Ask the host in the event chat.'}</p>
          <div className="facts">
            <div><span>Level</span><strong>{a.category === 'professional' ? 'Professional' : 'Casual'}</strong></div>
            <div><span>Format</span><strong>{a.type === 'team' ? 'Team vs team' : 'Group activity'}</strong></div>
            <div><span>Guest spots</span><strong>{people.length} / {a.max_participants}</strong></div>
            <div><span>Check-in</span><strong>QR on arrival</strong></div>
          </div>
          <div className="safety-box">
            <Icon name="shield" size={22} />
            <div>
              <strong>Safety first</strong>
              <p>Everyone checks in with a personal QR code on arrival.{a.night_mode && ' This is a night event, so attendees are asked to share live location with a trusted contact.'}</p>
            </div>
          </div>
          <Comments activity={a} userId={userId} member={isHost || !!me} attended={isHost || me?.status === 'checked_in'} onCommented={onCommented} />
        </div>
      )}

      {tab === 'chat' && (
        <div className="tab-body">
          <ChatPanel activityId={a.id} userId={userId} canChat={isHost || !!me} />
        </div>
      )}

      {tab === 'people' && (
        <div className="tab-body">
          <ul className="people">
            <li className="host-row">
              <Avatar name={a.host?.full_name} url={a.host?.avatar_url} size={40} />
              <div>
                <strong>{isHost ? 'You' : a.host?.full_name || 'Host'}</strong>
                {a.host?.is_verified && <span className="verified"><Icon name="check" size={12} /> Verified</span>}
              </div>
              <span className="pill pill-host">Host</span>
            </li>
          </ul>
          {people.length === 0 ? (
            <p className="muted">No guests yet.</p>
          ) : (
            <ul className="people">
              {people.map((p) => (
                <li key={p.user_id}>
                  <Avatar name={p.profile?.full_name} url={p.profile?.avatar_url} size={40} />
                  <div>
                    <strong>{p.user_id === userId ? 'You' : p.profile?.full_name || 'Player'}</strong>
                    {p.profile?.is_verified && <span className="verified"><Icon name="check" size={12} /> Verified</span>}
                  </div>
                  {p.status === 'checked_in'
                    ? <span className="pill pill-green">Checked in</span>
                    : <span className="pill">Joined</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'map' && (
        <div className="tab-body">
          {a.coords ? (
            <>
              <div className="card map-card"><MapView markers={markers} className="map-detail" /></div>
              <a className="link-btn" href={mapsUrl} target="_blank" rel="noreferrer">
                <Icon name="external" size={16} /> Get directions
              </a>
            </>
          ) : (
            <p className="muted">No map pin for this event.</p>
          )}
        </div>
      )}

      {/* Safety card: locked before the event, open while it's live, briefly after for checking out */}
      {(isHost || me) && (() => {
        const phase = eventPhase(a)
        const label = isTracked(a) ? 'Live safety' : 'Safety'
        if (phase === 'cancelled') return null
        if (phase === 'upcoming') {
          const opens = new Date(new Date(a.starts_at).getTime() - SAFETY_OPENS_MIN * 60e3).toISOString()
          return (
            <div className="live-entry locked">
              <Icon name="shield" size={26} />
              <div>
                <strong>{label}</strong>
                <p>Opens at {formatTime(opens)}, 30 min before the start</p>
              </div>
            </div>
          )
        }
        if (phase === 'ended' && Date.now() > eventEnd(a) + 12 * 3600e3) return null
        return (
          <div className="live-entry">
            <Icon name="shield" size={26} />
            <div>
              <strong>{phase === 'live' ? <><span className="live-dot-inline" /> {label} is on</> : 'Event ended'}</strong>
              <p>
                {phase === 'ended'
                  ? 'Check out so the group knows you got home safe'
                  : isTracked(a) ? 'Group radar, smart check-ins and SOS' : 'Check-ins, SOS, and check out when you leave'}
              </p>
            </div>
            <button className="btn btn-yellow" onClick={() => openLive(a.id)}>{phase === 'ended' ? 'Check out' : 'Open'}</button>
          </div>
        )
      })()}

      <div className="cta-bar" hidden={tab === 'chat'}>
        <div className="cta-people">
          <AvatarStack people={people} size={34} />
          <span className={left <= 2 ? 'low' : ''}>{left === 0 ? 'Full' : `${left} left`}</span>
        </div>

        <div className="cta-actions">
          {isHost ? (
            a.status === 'open' ? (
              <button className="btn btn-dark" onClick={() => actions.setStatus(a.id, 'closed')}>Close sign-ups</button>
            ) : a.status === 'closed' ? (
              <button className="btn btn-yellow" onClick={() => actions.setStatus(a.id, 'open')}>Reopen</button>
            ) : null
          ) : me ? (
            <>
              <button className="btn btn-ghost" onClick={() => actions.leave(a.id)}>Leave</button>
              {me.status === 'checked_in' ? (
                <span className="pill pill-green pill-lg"><Icon name="check" size={16} /> Checked in</span>
              ) : (
                <button className="btn btn-yellow" onClick={() => actions.showQr(a)}>
                  <Icon name="qr" size={18} /> My QR
                </button>
              )}
            </>
          ) : (
            <button className="btn btn-yellow btn-wide" disabled={a.status !== 'open'} onClick={() => actions.join(a.id)}>
              {a.status === 'open' ? 'Join event' : 'Sign-ups closed'}
            </button>
          )}
        </div>
      </div>
      {isHost && <p className="muted small host-hint">To check people in, scan their QR code with your phone camera while you're signed in.</p>}
    </div>
  )
}
