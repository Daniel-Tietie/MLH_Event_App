import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { addComment, getComments } from '../services/api'
import { fetchActivityPhotos, uploadActivityPhoto } from '../services/activityService'
import '../styles/social.css'
import '../styles/features.css'

const timeAgo = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' })
}

/**
 * Comments + photos after the event. Rules (also enforced in the database):
 *  - hidden until the event starts (use Chat to plan before)
 *  - only the host or people who checked in with their QR code can post
 * Attendees get a notification after the event inviting them to comment.
 */
export default function Comments({ activity, userId, attended, onCommented }) {
  const [comments, setComments] = useState([])
  const [photos, setPhotos] = useState([])
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [viewing, setViewing] = useState(null) // photo url in the lightbox
  const fileInput = useRef(null)

  const started = new Date(activity.starts_at) <= new Date()

  useEffect(() => {
    if (!started) return
    getComments(activity.id).then(setComments).catch((e) => setError(e.message))
    fetchActivityPhotos(activity.id).then(setPhotos).catch(() => setPhotos([]))
  }, [activity.id, started])

  // Local preview of the picked photo
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!started) return null

  async function post(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body && !file) return
    setBusy(true)
    setError(null)
    try {
      if (file) {
        await uploadActivityPhoto(activity.id, userId, file)
        setPhotos(await fetchActivityPhotos(activity.id))
        setFile(null)
      }
      if (body) {
        setComments(await addComment(activity.id, body))
        setText('')
      }
      onCommented?.(activity.id)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <section className="comments" id="comments">
      <h3>Comments <span className="count">{comments.length}</span></h3>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.slice(0, 8).map((p) => (
            <button key={p.id} className="photo" onClick={() => setViewing(p.image_url)} aria-label="Open photo">
              <img src={p.image_url} alt="" loading="lazy" />
            </button>
          ))}
          {photos.length > 8 && <span className="photo-more">+{photos.length - 8}</span>}
        </div>
      )}

      {attended ? (
        <form className="comment-box" onSubmit={post}>
          {preview && (
            <div className="photo-preview">
              <img src={preview} alt="Selected" />
              <button type="button" onClick={() => setFile(null)} aria-label="Remove photo"><Icon name="x" size={14} /></button>
            </div>
          )}
          <div className="comment-form">
            <button type="button" className="icon-btn photo-btn" onClick={() => fileInput.current?.click()} aria-label="Add a photo">📷</button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => { setFile(e.target.files?.[0] || null); e.target.value = '' }}
            />
            <input placeholder="How did it go? Shout out the group..." value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn btn-dark" disabled={busy || (!text.trim() && !file)}>{busy ? '...' : 'Post'}</button>
          </div>
        </form>
      ) : (
        <p className="muted small">Only people who checked in can post comments and photos.</p>
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

      {viewing && (
        <div className="modal-backdrop" onClick={() => setViewing(null)}>
          <img className="lightbox" src={viewing} alt="Event photo" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </section>
  )
}
