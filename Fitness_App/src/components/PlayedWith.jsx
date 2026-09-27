import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { Avatar } from './Avatar'
import { fetchPlayedWith, followUser, unfollowUser } from '../services/activityService'
import { refreshFollowing } from '../hooks/useFollowing'
import { activePeople, formatDate, formatTime, isNotOver, sportIcon } from '../utils/constants'

/**
 * Profile: people you've been at an event with.
 *  - "Played with": everyone, with Follow buttons
 *  - "Following": only people you follow, their next event, and Unfollow
 */
export default function PlayedWith({ userId, activities = [], notify, openEvent }) {
  const [people, setPeople] = useState(null)
  const [busy, setBusy] = useState(null)
  const [view, setView] = useState('all')
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    fetchPlayedWith().then((p) => setPeople(p || [])).catch(() => setPeople([]))
  }, [userId])

  // Next upcoming event each person is hosting or has joined
  const nextEvent = useMemo(() => {
    const out = {}
    activities
      .filter(isNotOver)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .forEach((a) => {
        const ids = [a.host_id, ...activePeople(a).map((p) => p.user_id)]
        ids.forEach((id) => { if (!out[id]) out[id] = a })
      })
    return out
  }, [activities])

  async function toggle(p) {
    setBusy(p.user_id)
    try {
      if (p.following) await unfollowUser(p.user_id)
      else await followUser(p.user_id)
      setPeople((list) => list.map((x) => (x.user_id === p.user_id ? { ...x, following: !x.following } : x)))
      refreshFollowing(userId)
      const first = p.full_name?.split(' ')[0] || 'them'
      notify(p.following ? `Unfollowed ${first}` : `Following ${first}. Their events show up on Explore.`, p.following ? 'info' : 'success')
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusy(null)
  }

  if (people === null) return null
  const followingList = people.filter((p) => p.following)
  const source = view === 'following' ? followingList : people
  const list = showAll ? source : source.slice(0, 6)

  return (
    <section className="section">
      <div className="section-head">
        <h2>Your people</h2>
        {people.length > 0 && (
          <div className="segmented">
            <button className={view === 'all' ? 'active' : ''} onClick={() => { setView('all'); setShowAll(false) }}>
              Played with ({people.length})
            </button>
            <button className={view === 'following' ? 'active' : ''} onClick={() => { setView('following'); setShowAll(false) }}>
              Following ({followingList.length})
            </button>
          </div>
        )}
      </div>

      {people.length === 0 ? (
        <div className="empty small">
          <div className="empty-icon"><Icon name="users" size={26} /></div>
          <p className="muted">After your first event, the people you played with show up here so you can follow them.</p>
        </div>
      ) : source.length === 0 ? (
        <div className="empty small">
          <div className="empty-icon"><Icon name="userPlus" size={26} /></div>
          <p className="muted">You're not following anyone yet. Follow people you've played with to see where they're going next.</p>
        </div>
      ) : (
        <>
          <ul className="played-list">
            {list.map((p) => {
              const next = nextEvent[p.user_id]
              return (
                <li key={p.user_id} className="card">
                  <Avatar name={p.full_name} url={p.avatar_url} size={42} />
                  <div className="played-info">
                    <strong>
                      {p.full_name || 'Player'}
                      {p.is_verified && <span className="verified"><Icon name="check" size={11} /></span>}
                    </strong>
                    {view === 'following' ? (
                      next ? (
                        <button className="next-event" onClick={() => openEvent(next.id)}>
                          {sportIcon(next.sport?.name)} Next: {next.title}<br />
                          <span className="muted">{formatDate(next.starts_at)} · {formatTime(next.starts_at)}</span>
                        </button>
                      ) : (
                        <span className="muted small">No upcoming events</span>
                      )
                    ) : (
                      <span className="muted small">
                        {p.games} game{p.games === 1 ? '' : 's'} together · last {formatDate(p.last_played)}
                      </span>
                    )}
                  </div>
                  <button
                    className={`btn btn-sm ${p.following ? 'btn-ghost btn-following' : 'btn-dark'}`}
                    disabled={busy === p.user_id}
                    onClick={() => toggle(p)}
                    aria-label={p.following ? `Unfollow ${p.full_name}` : `Follow ${p.full_name}`}
                  >
                    {p.following ? (
                      <>
                        <span className="when-idle">Following</span>
                        <span className="when-hover">Unfollow</span>
                      </>
                    ) : 'Follow'}
                  </button>
                </li>
              )
            })}
          </ul>
          {source.length > 6 && (
            <button className="link-btn" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show less' : `Show all ${source.length}`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
