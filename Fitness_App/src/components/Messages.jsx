import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import {
  fetchConversation, fetchDmThreads, markDmRead, sendDm, subscribeDms,
} from '../services/activityService'
import { activePeople, formatDate, formatTime, isNotOver, sportColors, sportIcon, eventIcon } from '../utils/constants'

const ago = (iso) => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  if (m < 1440) return `${Math.round(m / 60)}h`
  return formatDate(iso)
}

/**
 * Friends-only direct messages.
 * Left: conversations (+ friends you haven't messaged yet). Right: the open chat.
 * On phones the chat replaces the list, with a back button.
 */
export default function Messages({ userId, friends, activities, openEvent, notify, openWith, onRead }) {
  const [threads, setThreads] = useState(null)
  const [active, setActive] = useState(openWith || null) // other user's id

  const loadThreads = useCallback(
    () => fetchDmThreads().then((t) => setThreads(t || [])).catch(() => setThreads([])),
    []
  )

  useEffect(() => {
    loadThreads()
    const off = subscribeDms(userId, loadThreads)
    const t = setInterval(loadThreads, 8000)
    return () => { off(); clearInterval(t) }
  }, [userId, loadThreads])

  useEffect(() => { if (openWith) setActive(openWith) }, [openWith])

  const byId = useMemo(() => Object.fromEntries(friends.map((f) => [f.user_id, f])), [friends])
  const startable = friends.filter((f) => !(threads || []).some((t) => t.user_id === f.user_id))
  const activeThread = (threads || []).find((t) => t.user_id === active)
  const activePerson = activeThread || byId[active]

  if (threads === null) return <p className="muted">Loading messages...</p>

  return (
    <div className={`dm card ${active ? 'has-active' : ''}`}>
      <aside className="dm-list">
        {threads.length === 0 && startable.length === 0 && (
          <div className="empty small">
            <div className="empty-icon"><Icon name="chat" size={24} /></div>
            <p className="muted">You can message friends: people you follow who follow you back.</p>
          </div>
        )}
        {threads.map((t) => (
          <button key={t.user_id} className={`dm-thread ${active === t.user_id ? 'active' : ''}`} onClick={() => setActive(t.user_id)}>
            <Avatar name={t.full_name} url={t.avatar_url} size={40} />
            <span className="dm-thread-text">
              <strong>{t.full_name || 'Player'}</strong>
              <span className={t.unread ? 'unread' : 'muted'}>
                {t.last_from_me && 'You: '}
                {t.last_activity && !t.last_body ? '📅 Shared an event' : t.last_body}
              </span>
            </span>
            <span className="dm-meta">
              <time>{ago(t.last_at)}</time>
              {t.unread > 0 && <span className="dm-badge">{t.unread}</span>}
            </span>
          </button>
        ))}
        {startable.length > 0 && (
          <>
            <p className="dm-sub">Start a chat</p>
            {startable.map((f) => (
              <button key={f.user_id} className={`dm-thread ${active === f.user_id ? 'active' : ''}`} onClick={() => setActive(f.user_id)}>
                <Avatar name={f.full_name} url={f.avatar_url} size={40} />
                <span className="dm-thread-text">
                  <strong>{f.full_name || 'Player'}</strong>
                  <span className="muted">Say hi 👋</span>
                </span>
              </button>
            ))}
          </>
        )}
      </aside>

      <section className="dm-chat">
        {active && activePerson ? (
          <Conversation
            key={active}
            me={userId}
            other={activePerson}
            canMessage={activeThread ? activeThread.can_message : true}
            activities={activities}
            openEvent={openEvent}
            notify={notify}
            onBack={() => setActive(null)}
            onChange={() => { loadThreads(); onRead?.() }}
          />
        ) : (
          <div className="dm-placeholder">
            <div className="empty-icon"><Icon name="chat" size={26} /></div>
            <p className="muted">Pick a friend to plan your next game.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function Conversation({ me, other, canMessage, activities, openEvent, notify, onBack, onChange }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [picking, setPicking] = useState(false)
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)
  const otherId = other.user_id

  const load = useCallback(async () => {
    const rows = await fetchConversation(me, otherId).catch(() => null)
    if (!rows) return
    setMsgs(rows)
    if (rows.some((m) => m.sender_id === otherId && !m.read_at)) {
      await markDmRead(otherId).catch(() => {})
      onChange()
    }
  }, [me, otherId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()
    const off = subscribeDms(me, (m) => m.sender_id === otherId && load())
    const t = setInterval(load, 5000)
    return () => { off(); clearInterval(t) }
  }, [load, me, otherId])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs.length])

  const eventsById = useMemo(() => Object.fromEntries(activities.map((a) => [a.id, a])), [activities])
  // Events I can share: upcoming ones I'm hosting or joined
  const myUpcoming = useMemo(
    () => activities.filter((a) => isNotOver(a) && (a.host_id === me || activePeople(a).some((p) => p.user_id === me))),
    [activities, me]
  )

  async function send(body, activityId = null) {
    if (!body.trim() && !activityId) return
    setSending(true)
    try {
      await sendDm(otherId, body, activityId)
      setText('')
      setPicking(false)
      await load()
      onChange()
    } catch (e) {
      notify(e.message, 'error')
    }
    setSending(false)
  }

  return (
    <>
      <header className="dm-head">
        <button className="icon-btn dm-back" onClick={onBack} aria-label="Back to conversations"><Icon name="back" size={18} /></button>
        <Avatar name={other.full_name} url={other.avatar_url} size={36} />
        <div>
          <strong>{other.full_name || 'Player'}</strong>
          <span className="muted small">Friends · only you two can see this</span>
        </div>
      </header>

      <div className="chat-list dm-msgs" ref={listRef}>
        {msgs.length === 0 && <p className="muted chat-empty">No messages yet. Plan your next game!</p>}
        {msgs.map((m) => {
          const mine = m.sender_id === me
          const ev = m.activity_id && eventsById[m.activity_id]
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              <div className="bubble">
                {m.activity_id && (
                  ev ? (
                    <button className="dm-event" onClick={() => openEvent(ev.id)}>
                      <span className="dm-event-icon" style={{ background: sportColors(ev.sport?.name)[0] }}>{eventIcon(ev)}</span>
                      <span>
                        <strong>{ev.title}</strong>
                        <span>{formatDate(ev.starts_at)} · {formatTime(ev.starts_at)}{ev.city ? ` · ${ev.city}` : ''}</span>
                      </span>
                      <Icon name="right" size={16} />
                    </button>
                  ) : <p className="muted small">📅 This event is no longer available</p>
                )}
                {m.body && <p>{m.body}</p>}
                <time>{formatTime(m.created_at)}{mine && m.read_at ? ' · Seen' : ''}</time>
              </div>
            </div>
          )
        })}
      </div>

      {picking && (
        <div className="dm-picker">
          <p className="small"><strong>Share one of your upcoming events</strong></p>
          {myUpcoming.length === 0 ? (
            <p className="muted small">You're not hosting or going to anything yet.</p>
          ) : myUpcoming.slice(0, 6).map((a) => (
            <button key={a.id} className="dm-pick" disabled={sending} onClick={() => send('', a.id)}>
              {eventIcon(a)} {a.title} <span className="muted">· {formatDate(a.starts_at)}</span>
            </button>
          ))}
        </div>
      )}

      {canMessage ? (
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(text) }}>
          <button type="button" className={`icon-btn dm-share ${picking ? 'active' : ''}`} onClick={() => setPicking((v) => !v)} aria-label="Share an event">
            <Icon name="calendar" size={18} />
          </button>
          <input placeholder={`Message ${other.full_name?.split(' ')[0] || ''}...`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} />
          <button className="btn btn-primary" disabled={sending || !text.trim()} aria-label="Send"><Icon name="right" size={18} /></button>
        </form>
      ) : (
        <p className="muted small dm-locked">You can only message friends. Follow each other to chat again.</p>
      )}
    </>
  )
}
