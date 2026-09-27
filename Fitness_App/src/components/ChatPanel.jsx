import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { getMessages, sendMessage, subscribeToMessages } from '../services/api'
import { formatTime } from '../utils/constants'
import '../styles/social.css'

// Group chat for an event. Only the host and people who joined can read/send (enforced in the database).
export default function ChatPanel({ activityId, userId, canChat }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!canChat) return
    let alive = true
    const load = () =>
      getMessages(activityId)
        .then((m) => alive && setMessages(m))
        .catch((e) => alive && setError(e.message))

    load()
    const unsubscribe = subscribeToMessages(activityId, load) // instant updates
    const timer = setInterval(load, 5000) // backup in case realtime isn't enabled
    return () => {
      alive = false
      unsubscribe()
      clearInterval(timer)
    }
  }, [activityId, canChat])

  // Keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setText('')
    setError(null)
    try {
      await sendMessage(activityId, body)
      setMessages(await getMessages(activityId))
    } catch (err) {
      setError(err.message)
      setText(body)
    }
  }

  if (!canChat) {
    return (
      <div className="empty small">
        <div className="empty-icon"><Icon name="chat" size={26} /></div>
        <p className="muted">Join this event to chat with the group.</p>
      </div>
    )
  }

  return (
    <div className="chat card">
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="muted chat-empty">No messages yet. Say hi 👋</p>}
        {messages.map((m) => {
          const mine = m.senderId === userId
          return (
            <div key={m.id} className={`msg ${mine ? 'mine' : ''}`}>
              {!mine && <Avatar name={m.senderName} url={m.senderAvatarUrl} size={32} />}
              <div className="bubble">
                {!mine && <strong>{m.senderName || 'Player'}</strong>}
                <p>{m.body}</p>
                <time>{formatTime(m.createdAt)}</time>
              </div>
            </div>
          )
        })}
      </div>

      {error && <p className="form-error">{error}</p>}

      <form className="chat-input" onSubmit={send}>
        <input placeholder="Message the group..." value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary" aria-label="Send">
          <Icon name="right" size={18} />
        </button>
      </form>
    </div>
  )
}
