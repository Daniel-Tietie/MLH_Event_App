import { useEffect, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { fetchPlayedWith, followUser, unfollowUser } from '../services/activityService'
import { refreshFollowing } from '../hooks/useFollowing'
import { formatDate } from '../utils/constants'

// Profile: everyone you've been at an event with, with a Follow button.
// Following someone puts their upcoming events in "Friends are going" on Explore.
export default function PlayedWith({ userId, notify }) {
  const [people, setPeople] = useState(null)
  const [busy, setBusy] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetchPlayedWith().then((p) => setPeople(p || [])).catch(() => setPeople([]))
  }, [userId])

  async function toggle(p) {
    setBusy(p.user_id)
    try {
      if (p.following) await unfollowUser(p.user_id)
      else await followUser(p.user_id)
      setPeople((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, following: !x.following } : x)))
      refreshFollowing(userId)
      if (!p.following) notify(`Following ${p.full_name?.split(' ')[0] || 'them'}. Their events show up on Explore.`, 'success')
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusy(null)
  }

  if (people === null) return null
  const list = showAll ? people : people.slice(0, 6)
  const count = people.filter((p) => p.following).length

  return (
    <section className="section">
      <div className="section-head">
        <h2>People you've played with <span className="count">{people.length}</span></h2>
        {count > 0 && <span className="muted small">Following {count}</span>}
      </div>
      {people.length === 0 ? (
        <div className="empty small">
          <div className="empty-icon">🤝</div>
          <p className="muted">After your first event, the people you played with show up here so you can follow them.</p>
        </div>
      ) : (
        <>
          <ul className="played-list">
            {list.map((p) => (
              <li key={p.user_id} className="card">
                <Avatar name={p.full_name} url={p.avatar_url} size={42} />
                <div className="played-info">
                  <strong>
                    {p.full_name || 'Player'}
                    {p.is_verified && <span className="verified"><Icon name="check" size={11} /></span>}
                  </strong>
                  <span className="muted small">
                    {p.games} game{p.games === 1 ? '' : 's'} together · last {formatDate(p.last_played)}
                  </span>
                </div>
                <button
                  className={`btn btn-sm ${p.following ? 'btn-ghost' : 'btn-dark'}`}
                  disabled={busy === p.user_id}
                  onClick={() => toggle(p)}
                >
                  {p.following ? 'Following' : 'Follow'}
                </button>
              </li>
            ))}
          </ul>
          {people.length > 6 && (
            <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${people.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
