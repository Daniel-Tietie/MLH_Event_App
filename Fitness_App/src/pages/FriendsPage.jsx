import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { Avatar } from '../components/Avatar'
import FriendsGoing from '../components/FriendsGoing'
import Messages from '../components/Messages'
import { fetchMyFollowers, fetchPlayedWith, followUser, removeFollower, unfollowUser } from '../services/activityService'
import { refreshFollowing } from '../hooks/useFollowing'
import { activePeople, formatDate, formatTime, isNotOver, sportIcon } from '../utils/constants'
import '../styles/features.css'
import '../styles/explore.css'

const TABS = [
  ['messages', 'Messages'],
  ['following', 'Following'],
  ['followers', 'Followers'],
  ['played', 'Played with'],
]

/**
 * Friends: who you follow, who follows you, and everyone you've played with.
 * Only you can see these lists. Mutual follows are marked "Friends".
 */
export default function FriendsPage({ session, data, notify, openEvent, focus, dmUnread = 0, refreshUnread }) {
  const userId = session.user.id
  // "#/friends?focus=dm:<userId>" opens that chat directly
  const dmWith = focus?.startsWith('dm:') ? focus.slice(3) : null
  const [tab, setTab] = useState(dmWith ? 'messages' : 'following')
  const [chatWith, setChatWith] = useState(dmWith)
  useEffect(() => { if (dmWith) { setTab('messages'); setChatWith(dmWith) } }, [dmWith])
  const [played, setPlayed] = useState(null)
  const [followers, setFollowers] = useState(null)
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    fetchPlayedWith().then((p) => setPlayed(p || [])).catch(() => setPlayed([]))
    fetchMyFollowers().then((f) => setFollowers(f || [])).catch(() => setFollowers([]))
  }, [])
  useEffect(load, [load])

  // Next upcoming event for each person (hosting or joined)
  const nextEvent = useMemo(() => {
    const out = {}
    data.activities
      .filter(isNotOver)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .forEach((a) => [a.host_id, ...activePeople(a).map((p) => p.user_id)].forEach((id) => { if (!out[id]) out[id] = a }))
    return out
  }, [data.activities])

  const followerIds = useMemo(() => new Set((followers || []).map((f) => f.user_id)), [followers])

  // Everyone I follow, from both lists (someone who followed me first may not be in "played with")
  const followingList = useMemo(() => {
    const map = new Map()
    ;(played || []).filter((p) => p.following).forEach((p) => map.set(p.user_id, p))
    ;(followers || []).filter((f) => f.following_back && !map.has(f.user_id))
      .forEach((f) => map.set(f.user_id, { ...f, following: true }))
    return [...map.values()]
  }, [played, followers])

  async function run(p, action) {
    setBusy(p.user_id)
    const first = p.full_name?.split(' ')[0] || 'them'
    try {
      if (action === 'follow') { await followUser(p.user_id); notify(`Following ${first}`, 'success') }
      if (action === 'unfollow') { await unfollowUser(p.user_id); notify(`Unfollowed ${first}`, 'info') }
      if (action === 'remove') { await removeFollower(p.user_id); notify(`Removed ${first}. They can't follow you again.`, 'info') }
      load()
      refreshFollowing(userId)
    } catch (e) {
      notify(e.message, 'error')
    }
    setBusy(null)
  }

  // Friends = you follow each other (the only people you can message)
  const friends = followingList.filter((p) => followerIds.has(p.user_id))
  const message = (p) => { setChatWith(p.user_id); setTab('messages') }

  if (played === null || followers === null) {
    return <div className="page"><p className="muted">Loading friends...</p></div>
  }

  const lists = { messages: friends, following: followingList, followers, played }
  const list = lists[tab]

  const empty = {
    following: ['userPlus', "You're not following anyone yet", 'Follow people from "Played with" to see where they play next.'],
    followers: ['users', 'No followers yet', 'People you play with can follow you. Only you can see this list.'],
    played: ['users', 'No one yet', 'After your first event, everyone you played with shows up here.'],
  }[tab]

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Friends</p>
          <h1>Your people</h1>
        </div>
        <div className="segmented">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {id === 'messages' ? label : `${label} (${lists[id].length})`}
              {id === 'messages' && dmUnread > 0 && <span className="tab-badge">{dmUnread}</span>}
            </button>
          ))}
        </div>
      </header>

      <p className="muted small rel-hint">
        <Icon name="shield" size={16} />
        {tab === 'messages'
          ? 'You can only message friends (you follow each other). No messages from strangers.'
          : 'Only you can see who follows you and who you follow.'}
      </p>

      {tab === 'messages' ? (
        <Messages
          userId={userId}
          friends={friends}
          activities={data.activities}
          openEvent={openEvent}
          notify={notify}
          openWith={chatWith}
          onRead={refreshUnread}
        />
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name={empty[0]} size={26} /></div>
          <h3>{empty[1]}</h3>
          <p className="muted">{empty[2]}</p>
          {tab === 'following' && played.length > 0 && (
            <button className="btn btn-dark" onClick={() => setTab('played')}>See who you played with</button>
          )}
        </div>
      ) : (
        <ul className="played-list">
          {list.map((p) => {
            const iFollow = tab === 'followers' ? p.following_back : p.following
            const mutual = iFollow && followerIds.has(p.user_id)
            const next = nextEvent[p.user_id]
            return (
              <li key={p.user_id} className="card">
                <Avatar name={p.full_name} url={p.avatar_url} size={42} />
                <div className="played-info">
                  <strong>
                    {p.full_name || 'Player'}
                    {p.is_verified && <span className="verified"><Icon name="check" size={11} /></span>}
                    {mutual && <span className="following-tag">Friends</span>}
                  </strong>
                  {tab === 'played' && (
                    <span className="muted small">{p.games} game{p.games === 1 ? '' : 's'} together · last {formatDate(p.last_played)}</span>
                  )}
                  {tab === 'followers' && !mutual && <span className="muted small">Follows you · since {formatDate(p.since)}</span>}
                  {(tab === 'following' || mutual) && (next ? (
                    <button className="next-event" onClick={() => openEvent(next.id)}>
                      {sportIcon(next.sport?.name)} Next: {next.title}<br />
                      <span className="muted">{formatDate(next.starts_at)} · {formatTime(next.starts_at)}</span>
                    </button>
                  ) : <span className="muted small">No upcoming events</span>)}
                </div>

                <div className="friend-actions">
                  {mutual && (
                    <button className="btn btn-ghost btn-sm" onClick={() => message(p)} aria-label={`Message ${p.full_name}`}>
                      <Icon name="chat" size={16} />
                    </button>
                  )}
                  {tab === 'followers' && (
                    <button className="btn btn-ghost btn-sm btn-remove" disabled={busy === p.user_id} onClick={() => run(p, 'remove')}>
                      Remove
                    </button>
                  )}
                  {iFollow ? (
                    <button className="btn btn-sm btn-ghost btn-following" disabled={busy === p.user_id} onClick={() => run(p, 'unfollow')}>
                      <span className="when-idle">Following</span>
                      <span className="when-hover">Unfollow</span>
                    </button>
                  ) : (
                    <button className="btn btn-sm btn-dark" disabled={busy === p.user_id} onClick={() => run(p, 'follow')}>
                      {tab === 'followers' ? 'Follow back' : 'Follow'}
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {tab !== 'messages' && <FriendsGoing session={session} activities={data.activities} openEvent={openEvent} />}
    </div>
  )
}
