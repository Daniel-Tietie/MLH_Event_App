import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import EventCard from '../components/EventCard'
import SportTiles from '../components/SportTiles'
import ForYou from '../components/ForYou'
import FriendsGoing from '../components/FriendsGoing'
import { isNotOver, spotsLeft } from '../utils/constants'
import '../styles/explore.css'

const SORTS = { soon: 'Soonest', spots: 'Most spots', new: 'Newest' }

export default function ExplorePage({ session, data, openEvent, navigate }) {
  const { activities, sports, loading, error } = data
  const firstName = (session.user.user_metadata?.full_name || '').split(' ')[0]

  const [sportId, setSportId] = useState('')
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('soon')
  const [openOnly, setOpenOnly] = useState(false)

  // Only show events that aren't over (not completed, cancelled, or past their end time)
  const upcoming = useMemo(
    () => activities.filter(isNotOver),
    [activities]
  )

  const counts = useMemo(() => {
    const c = {}
    upcoming.forEach((a) => a.sport && (c[a.sport.id] = (c[a.sport.id] || 0) + 1))
    return c
  }, [upcoming])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = upcoming.filter(
      (a) =>
        (!sportId || a.sport?.id === Number(sportId)) &&
        (!category || a.category === category) &&
        (!openOnly || a.status === 'open') &&
        (!q || [a.title, a.city, a.address, a.sport?.name].some((v) => v?.toLowerCase().includes(q)))
    )
    if (sort === 'spots') return [...list].sort((a, b) => spotsLeft(b) - spotsLeft(a))
    if (sort === 'new') return [...list].reverse()
    return list
  }, [upcoming, sportId, category, openOnly, search, sort])

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{firstName ? `Hi ${firstName} 👋` : 'Welcome 👋'}</p>
          <h1>Find your next game</h1>
        </div>
        <div className="head-actions">
          <label className="search">
            <Icon name="search" size={18} />
            <input placeholder="Search events, sports, places" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="sort-btn">
            <Icon name="sort" size={18} />
            <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
              {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
      </header>

      <ForYou session={session} activities={activities} openEvent={openEvent} navigate={navigate} />
      <FriendsGoing session={session} activities={activities} openEvent={openEvent} />

      <section className="section">
        <div className="section-head">
          <h2>All Category</h2>
          <div className="segmented">
            {[['', 'All'], ['casual', 'Casual'], ['professional', 'Pro']].map(([v, label]) => (
              <button key={v} className={category === v ? 'active' : ''} onClick={() => setCategory(v)}>{label}</button>
            ))}
          </div>
        </div>
        <SportTiles sports={sports} counts={counts} total={upcoming.length} selected={sportId} onSelect={setSportId} />
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Upcoming events <span className="count">{visible.length}</span></h2>
          <label className="switch-label">
            <span>Open only</span>
            <input type="checkbox" className="switch" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          </label>
        </div>

        {error && <p className="form-error">Couldn't load events: {error}</p>}

        {loading ? (
          <div className="card-grid">{[1, 2, 3, 4].map((i) => <div key={i} className="ecard skeleton" />)}</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><Icon name="search" size={26} /></div>
            <h3>No events match</h3>
            <p className="muted">Be the first. Host one and people nearby will see it.</p>
            <button className="btn btn-primary" onClick={() => navigate('create')}>
              <Icon name="plus" size={18} /> Host an event
            </button>
          </div>
        ) : (
          <div className="card-grid">
            {visible.map((a) => <EventCard key={a.id} activity={a} onOpen={openEvent} />)}
          </div>
        )}
      </section>
    </div>
  )
}
