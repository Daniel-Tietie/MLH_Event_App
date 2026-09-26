import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import MapView from '../components/MapView'
import { createActivity } from '../services/activityService'
import { currentPosition, geocode, reverseGeocode, toPoint } from '../utils/geo'
import { isNightTime, sportIcon } from '../utils/constants'
import '../styles/forms.css'

export default function CreateEventPage({ session, data, preset, notify, goBack, onCreated }) {
  const { sports } = data
  const [form, setForm] = useState({
    title: '',
    sport_id: '',
    category: 'casual',
    type: 'casual',
    opponent_team: '',
    date: preset?.date || '',
    time: '',
    max_participants: 8,
    description: '',
    city: '',
    address: '',
  })
  const [night, setNight] = useState(false)
  const [coords, setCoords] = useState(null)
  const [mapCenter, setMapCenter] = useState(null)
  const [place, setPlace] = useState('')
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Default sport + start the map near the user
  useEffect(() => {
    if (sports.length && !form.sport_id) setForm((f) => ({ ...f, sport_id: sports[0].id }))
  }, [sports]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    currentPosition().then((p) => p && setMapCenter(p))
  }, [])

  // Turn on night safety mode automatically for late events
  useEffect(() => {
    if (form.date && form.time) setNight(isNightTime(`${form.date}T${form.time}`))
  }, [form.date, form.time])

  // Map click -> drop pin and fill in the address
  async function dropPin(point) {
    setCoords(point)
    const found = await reverseGeocode(point)
    if (found) setForm((f) => ({ ...f, address: found.address || f.address, city: found.city || f.city }))
  }

  async function findPlace() {
    if (!place.trim()) return
    setFinding(true)
    const point = await geocode(place)
    setFinding(false)
    if (!point) return notify("Couldn't find that place. Try adding the city.", 'error')
    dropPin(point)
  }

  async function useMyLocation() {
    const p = await currentPosition()
    if (!p) return notify('Location is blocked in your browser.', 'error')
    dropPin(p)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!coords) return setError('Drop a pin on the map so people know where to meet.')
    setBusy(true)

    const startsAt = new Date(`${form.date}T${form.time}`)
    const { error } = await createActivity({
      host_id: session.user.id,
      title: form.title,
      description: form.description || null,
      sport_id: Number(form.sport_id),
      category: form.category,
      type: form.type,
      opponent_team: form.type === 'team' ? form.opponent_team || null : null,
      city: form.city,
      address: form.address || null,
      location: toPoint(coords),
      starts_at: startsAt.toISOString(),
      max_participants: Number(form.max_participants),
      night_mode: night,
      status: 'open',
    })

    setBusy(false)
    if (error) return setError(error.message)
    notify('Event published! 🎉', 'success')
    onCreated()
  }

  return (
    <div className="page form-page">
      <header className="form-header">
        <button type="button" className="icon-btn" onClick={goBack} aria-label="Back">
          <Icon name="back" />
        </button>
        <h2>Add new event</h2>
        <span />
      </header>

      <form className="card form" onSubmit={handleSubmit}>
        <h3 className="form-section">Information event</h3>

        <input placeholder="Event name*" value={form.title} onChange={set('title')} required />

        <div className="row">
          <select value={form.sport_id} onChange={set('sport_id')} required aria-label="Sport">
            {sports.map((s) => <option key={s.id} value={s.id}>{sportIcon(s.name)}  {s.name}</option>)}
          </select>
          <select value={form.category} onChange={set('category')} aria-label="Level">
            <option value="casual">🟢  Casual</option>
            <option value="professional">🟠  Professional</option>
          </select>
        </div>

        <div className="row">
          <label className="with-icon">
            <input type="date" value={form.date} onChange={set('date')} required aria-label="Date" />
            <Icon name="calendar" size={18} />
          </label>
          <label className="with-icon">
            <input type="time" value={form.time} onChange={set('time')} required aria-label="Start time" />
            <Icon name="clock" size={18} />
          </label>
        </div>

        <div className="row">
          <select value={form.type} onChange={set('type')} aria-label="Format">
            <option value="casual">👥  Group activity</option>
            <option value="team">⚔️  Team vs team</option>
          </select>
          <label className="with-icon">
            <input type="number" min="1" max="200" value={form.max_participants} onChange={set('max_participants')} required aria-label="Max people" />
            <Icon name="users" size={18} />
          </label>
        </div>

        {form.type === 'team' && (
          <input placeholder="Opponent team (leave blank for an open challenge)" value={form.opponent_team} onChange={set('opponent_team')} />
        )}

        <textarea rows={3} placeholder="Type the note here... (pace, what to bring, skill level)" value={form.description} onChange={set('description')} />

        <label className="toggle-row">
          <span>
            <Icon name="moon" size={18} /> Night safety mode
            <small>Asks attendees to share live location with a trusted contact</small>
          </span>
          <input type="checkbox" className="switch" checked={night} onChange={(e) => setNight(e.target.checked)} />
        </label>

        <h3 className="form-section">Pin the meeting spot</h3>

        <div className="place-search">
          <label className="with-icon grow">
            <input
              placeholder="Search a place, e.g. Odell Park Fredericton"
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), findPlace())}
            />
            <Icon name="search" size={18} />
          </label>
          <button type="button" className="btn btn-dark" onClick={findPlace} disabled={finding}>
            {finding ? '...' : 'Find'}
          </button>
          <button type="button" className="icon-btn" onClick={useMyLocation} title="Use my location">
            <Icon name="locate" />
          </button>
        </div>

        <div className="map-card picker">
          <MapView picked={coords} center={mapCenter} onPick={dropPin} className="map-picker" />
          {!coords && <span className="map-hint">Tap the map to drop a pin</span>}
        </div>

        <div className="row">
          <input placeholder="Meeting spot (public place)" value={form.address} onChange={set('address')} />
          <input placeholder="City*" value={form.city} onChange={set('city')} required />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
          {busy ? 'Publishing...' : 'Create event'}
        </button>
      </form>
    </div>
  )
}