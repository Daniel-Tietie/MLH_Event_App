import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { addComment, getComments } from '../services/api'
import { fetchActivityPhotos, reportPhoto, setPhotoHidden, uploadActivityPhoto } from '../services/activityService'
import { initials } from '../utils/constants'
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
 *  - private: only the host and people who joined can see them (not the public)
 *  - hidden until the event starts (use Chat to plan before)
 *  - only the host or people who checked in with their QR code can post
 * Attendees get a notification after the event inviting them to comment.
 */
export default function Comments({ activity, userId, member, attended, onCommented }) {
  const [comments, setComments] = useState([])
  const [photos, setPhotos] = useState([])
  const [text, setText] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [viewingId, setViewingId] = useState(null) // photo open in the lightbox
  const fileInput = useRef(null)

  const started = new Date(activity.starts_at) <= new Date()

  useEffect(() => {
    if (!started || !member) return
    getComments(activity.id).then(setComments).catch((e) => setError(e.message))
    fetchActivityPhotos(activity.id, userId).then(setPhotos).catch(() => setPhotos([]))
  }, [activity.id, started, member, userId])

  // Local preview of the picked photo
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!started) return null

  if (!member) {
    return (
      <section className="comments" id="comments">
        <h3>Comments & photos</h3>
        <div className="private-note">
          <Icon name="shield" size={18} />
          <p className="small">Only people who joined this event can see its comments and photos.</p>
        </div>
      </section>
    )
  }

  const isHost = activity.host_id === userId
  // Hidden photos stay visible to the host and the uploader (greyed out) so they can restore them
  const shown = photos.filter((p) => !p.hidden || isHost || p.user_id === userId)
  const viewing = shown.find((p) => p.id === viewingId) || null
  const uploaderName = (p) => (p.user_id === userId ? 'You' : p.uploader?.full_name || 'Player')

  async function reload() {
    setPhotos(await fetchActivityPhotos(activity.id, userId))
  }

  async function post(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body && !file) return
    setBusy(true)
    setError(null)
    try {
      if (file) {
        await uploadActivityPhoto(activity.id, userId, file)
        setPhotos(await fetchActivityPhotos(activity.id, userId))
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

      {shown.length > 0 && (
        <div className="photo-grid">
          {shown.slice(0, 8).map((p) => (
            <button
              key={p.id}
              className={`photo ${p.hidden ? 'is-hidden' : ''}`}
              onClick={() => setViewingId(p.id)}
              aria-label={`Open photo by ${uploaderName(p)}`}
            >
              <img src={p.image_url} alt="" loading="lazy" />
              <span className="photo-by" title={`Uploaded by ${uploaderName(p)}`}>
                {p.user_id === userId ? 'You' : initials(p.uploader?.full_name || 'Player')}
              </span>
              {p.hidden && <span className="photo-flag">Hidden</span>}
              {!p.hidden && isHost && p.reports > 0 && <span className="photo-flag">⚑ {p.reports}</span>}
            </button>
          ))}
          {shown.length > 8 && <span className="photo-more">+{shown.length - 8}</span>}
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
        <PhotoViewer
          photo={viewing}
          name={uploaderName(viewing)}
          isUploaderHost={viewing.user_id === activity.host_id}
          canModerate={isHost || viewing.user_id === userId}
          isMine={viewing.user_id === userId}
          isHost={isHost}
          onClose={() => setViewingId(null)}
          onChanged={reload}
        />
      )}
    </section>
  )
}

const REASONS = ['Inappropriate', 'Spam', 'Not from this event', 'Other']

// Lightbox with an uploader banner, so every photo can be traced back to who posted it
function PhotoViewer({ photo, name, isUploaderHost, canModerate, isMine, isHost, onClose, onChanged }) {
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState(REASONS[0])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function run(fn, done) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fn()
      setMsg({ ok: true, text: typeof done === 'function' ? done(r) : done })
      setReporting(false)
      await onChanged()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <figure className="photo-viewer" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        <img className={`lightbox ${photo.hidden ? 'is-hidden' : ''}`} src={photo.image_url} alt={`Photo by ${name}`} />

        <figcaption className="uploader-banner">
          <Avatar name={photo.uploader?.full_name || 'Player'} url={photo.uploader?.avatar_url} size={36} />
          <div className="uploader-text">
            <strong>
              {name}
              {isUploaderHost && <span className="host-tag">Host</span>}
            </strong>
            <span className="muted small">
              Uploaded {timeAgo(photo.created_at)}
              {photo.hidden && ' · Hidden from others'}
              {isHost && photo.reports > 0 && ` · ⚑ ${photo.reports} report${photo.reports === 1 ? '' : 's'}`}
            </span>
          </div>

          <div className="uploader-actions">
            {canModerate && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={() =>
                  run(() => setPhotoHidden(photo.id, !photo.hidden), photo.hidden ? 'Photo restored' : 'Photo hidden from everyone else')
                }
              >
                {photo.hidden ? 'Restore' : isMine && !isHost ? 'Remove' : 'Hide'}
              </button>
            )}
            {!isMine && (photo.reportedByMe ? (
              <span className="reported-tag">⚑ Reported</span>
            ) : (
              <button className="btn btn-sm btn-report" disabled={busy} onClick={() => setReporting((v) => !v)}>
                ⚑ Report
              </button>
            ))}
          </div>
        </figcaption>

        {reporting && (
          <div className="report-box">
            <p className="small">Why are you reporting this photo? The host will see it, and 3 reports hide it automatically.</p>
            <div className="chip-row">
              {REASONS.map((r) => (
                <button key={r} className={`chip ${reason === r ? 'active' : ''}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <div className="report-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => setReporting(false)}>Cancel</button>
              <button
                className="btn btn-sm btn-report solid"
                disabled={busy}
                onClick={() => run(() => reportPhoto(photo.id, reason), (hidden) => (hidden ? 'Reported. The photo is now hidden.' : 'Reported. Thanks, the host can review it.'))}
              >
                {busy ? '...' : 'Send report'}
              </button>
            </div>
          </div>
        )}

        {msg && <p className={msg.ok ? 'viewer-msg' : 'form-error'}>{msg.text}</p>}
      </figure>
    </div>
  )
}
