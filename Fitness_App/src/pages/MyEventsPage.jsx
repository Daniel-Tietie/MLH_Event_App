import { useMemo, useState } from 'react'
import EventCard from '../components/EventCard'
import '../styles/explore.css'
import '../styles/social.css'

const TABS = [
  ['all', 'All'],
  ['host', 'Hosting'],
  ['joined', 'Joined'],
]

// Everything you're part of: events you host + events you joined, upcoming first
export default function MyEventsPage({ session, data, openEvent, navigate }) {
  const userId = session.user.id
  const [tab, setTab] = useState('all')

  const mine = useMemo(
    () =>
      data.activities
        .map((a) => {
          if (a.host_id === userId) return { ...a, role: 'host' }
          if (a.people.some((p) => p.user_id === userId && p.status !== 'left')) return { ...a, role: 'joined' }
          return null
        })
        .filter(Boolean),
    [data.activities, userId]
  )

  const counts = { all: mine.length, host: mine.filter((a) => a.role === 'host').length, joined: mine.filter((a) => a.role === 'joined').length }
  const list = tab === 'all' ? mine : mine.filter((a) => a.role === tab)

  // "Upcoming" includes events that started less than 3 hours ago (still happening)
  const cutoff = Date.now() - 3 * 3600e3
  const upcoming = list.filter((a) => new Date(a.starts_at) >= cutoff)
  const past = list.filter((a) => new Date(a.starts_at) < cutoff).reverse()

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">My events</p>
          <h1>Your schedule</h1>
        </div>
        <div className="segmented">
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
              {label} ({counts[id]})
            </button>
          ))}
        </div>
      </header>

      {data.loading ? (
        <div className="card-grid">{[1, 2].map((i) => <div key={i} className="ecard skeleton" />)}</div>
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🎟️</div>
          <h3>Nothing here yet</h3>
          <p className="muted">Events you host or join will show up here.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => navigate('explore')}>Explore events</button>
            <button className="btn btn-primary" onClick={() => navigate('create')}>Host an event</button>
          </div>
        </div>
      ) : (
        <>
          <section className="section">
            <div className="section-head"><h2>Upcoming <span className="count">{upcoming.length}</span></h2></div>
            {upcoming.length === 0
              ? <p className="muted">Nothing coming up.</p>
              : <div className="card-grid">{upcoming.map((a) => <EventCard key={a.id} activity={a} role={a.role} onOpen={openEvent} />)}</div>}
          </section>

          {past.length > 0 && (
            <section className="section">
              <div className="section-head"><h2>Past <span className="count">{past.length}</span></h2></div>
              <div className="card-grid past">{past.map((a) => <EventCard key={a.id} activity={a} role={a.role} onOpen={openEvent} />)}</div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
