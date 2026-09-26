import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { addComment, getComments } from '../services/api'
import '../styles/social.css'

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * Comments after the event. Rules (also enforced in the database):
 *  - hidden until the event starts (use Chat to plan before)
 *  - only the host or people who checked in with their QR code can post
 * Attendees get a notification after the event inviting them to comment.
 */
export default function Comments({ activity, userId, attended, onCommented }) {
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const started = new Date(activity.starts_at) <= new Date()

  useEffect(() => {
    if (!started) return
    getComments(activity.id).then(setComments).catch((e) => setError(e.message))
  }, [activity.id, started])

  if (!started) return null

  async function post(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body) return
    setBusy(true)
    setError(null)
    try {
      setComments(await addComment(activity.id, body))
      setText('')
      onCommented?.(activity.id)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className="comments" id="comments">
      <h3>Comments <span className="count">{comments.length}</span></h3>

      {attended ? (
        <form className="comment-form" onSubmit={post}>
          <input placeholder="How did it go? Shout out the group..." value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-dark" disabled={busy || !text.trim()}>Post</button>
        </form>
      ) : (
        <p className="muted small">Only people who checked in can comment.</p>
      )}

      {error && <p className="form-error">{error}</p>}

      {comments.length === 0 ? (
        <p className="muted small">No comments yet.</p>
      ) : (
        <ul className="comment-list">
          {comments.map((c) => (
            <li key={c.id}>
              <Avatar name={c.authorName} url={c.authorAvatarUrl} size={36} />
              <div>
                <p className="comment-meta">
                  <strong>{c.userId === userId ? 'You' : c.authorName || 'Player'}</strong>
                  <span className="attended-tag"><Icon name="check" size={11} /> Attended</span>
                  <span>{timeAgo(c.createdAt)}</span>
                </p>
                <p>{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
