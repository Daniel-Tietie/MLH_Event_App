import { useMemo } from 'react'
import Icon from './Icon'
import { AvatarStack } from './Avatar'
import { useFollowing } from '../hooks/useFollowing'
import { activePeople, formatDate, formatTime, isNotOver, sportColors, sportIcon, spotsLeft, eventIcon } from '../utils/constants'

// Explore: upcoming events that people you follow are hosting or have joined
export default function FriendsGoing({ session, activities, openEvent }) {
  const userId = session.user.id
  const following = useFollowing(userId)

  const events = useMemo(() => {
    if (!following.size) return []
    return activities
      .filter((a) => isNotOver(a) && a.host_id !== userId && !activePeople(a).some((p) => p.user_id === userId))
      .map((a) => {
        const friends = activePeople(a).filter((p) => following.has(p.user_id) && p.user_id !== a.host_id)
        const hostIsFriend = following.has(a.host_id)
        return { ...a, friends, hostIsFriend }
      })
      .filter((a) => a.friends.length || a.hostIsFriend)
      .sort((x, y) => (y.friends.length + y.hostIsFriend) - (x.friends.length + x.hostIsFriend) || new Date(x.starts_at) - new Date(y.starts_at))
      .slice(0, 8)
  }, [activities, following, userId])

  if (!events.length) return null

  const first = (n) => (n || 'Someone').split(' ')[0]
  const label = (a) => {
    const names = a.friends.map((p) => first(p.profile?.full_name))
    if (a.hostIsFriend) names.unshift(`${first(a.host?.full_name)} (host)`)
    if (names.length <= 2) return `${names.join(' & ')} ${names.length === 1 && !a.hostIsFriend ? 'is' : 'are'} going`
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} going`
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Friends are going 👋</h2>
        <span className="muted small">People you follow</span>
      </div>
      <div className="foryou-row">
        {events.map((a) => {
          const [c1, c2] = sportColors(a.sport?.name)
          const left = spotsLeft(a)
          return (
            <article key={a.id} className="foryou-card" onClick={() => openEvent(a.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEvent(a.id)}>
              <div className="foryou-top" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                <span className="foryou-emoji">{eventIcon(a)}</span>
                {a.category === 'professional' && <span className="tag tag-pro">PRO</span>}
              </div>
              <div className="foryou-body">
                <h3>{a.title}</h3>
                <p className="muted small"><Icon name="calendar" size={13} /> {formatDate(a.starts_at)} · {formatTime(a.starts_at)}</p>
                <span className="friends-tag">{label(a)}</span>
                <div className="foryou-foot">
                  <AvatarStack people={a.friends.length ? a.friends : activePeople(a)} size={24} />
                  <span className={left <= 2 ? 'low' : ''}>{left} left</span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
