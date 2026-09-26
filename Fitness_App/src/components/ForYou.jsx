import { useEffect, useMemo, useState } from 'react'
import Icon from './Icon'
import { AvatarStack } from './Avatar'
import { getProfile } from '../services/api'
import { recommend } from '../utils/recommend'
import { activePeople, formatDate, formatTime, sportColors, sportIcon, spotsLeft } from '../utils/constants'
import '../styles/features.css'

// "For you" row on Explore: events matched to the sports + levels on your profile
export default function ForYou({ session, activities, openEvent, navigate }) {
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    getProfile().then(setProfile).catch(() => setProfile({ sports: [] }))
  }, [])

  const picks = useMemo(
    () => (profile ? recommend(activities, { userId: session.user.id, mySports: profile.sports, city: profile.city || '' }) : []),
    [activities, profile, session.user.id]
  )

  if (!profile) return null

  // No sports on the profile yet: nudge them to add some
  if (!profile.sports.length) {
    return (
      <section className="section">
        <div className="foryou-empty">
          <span className="foryou-empty-icon">✨</span>
          <div>
            <strong>Get events picked for you</strong>
            <p>Add the sports you play and your level, and we'll match you with the right games.</p>
          </div>
          <button className="btn btn-yellow" onClick={() => navigate('profile')}>Add my sports</button>
        </div>
      </section>
    )
  }

  if (!picks.length) return null

  return (
    <section className="section">
      <div className="section-head">
        <h2>For you ✨</h2>
        <span className="muted small">Based on your sports and level</span>
      </div>

      <div className="foryou-row">
        {picks.map((a) => {
          const [c1, c2] = sportColors(a.sport?.name)
          const left = spotsLeft(a)
          return (
            <article key={a.id} className="foryou-card" onClick={() => openEvent(a.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openEvent(a.id)}>
              <div className="foryou-top" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                <span className="foryou-emoji">{sportIcon(a.sport?.name)}</span>
                {a.category === 'professional' && <span className="tag tag-pro">PRO</span>}
              </div>
              <div className="foryou-body">
                <h3>{a.title}</h3>
                <p className="muted small">
                  <Icon name="calendar" size={13} /> {formatDate(a.starts_at)} · {formatTime(a.starts_at)}
                </p>
                <div className="foryou-reasons">
                  {a.reasons.map((r) => <span key={r} className="reason">{r}</span>)}
                </div>
                <div className="foryou-foot">
                  <AvatarStack people={activePeople(a)} size={24} />
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
