import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import MapView from '../components/MapView'
import EventCard from '../components/EventCard'
import { currentPosition, distanceKm } from '../utils/geo'
import { DEFAULT_CENTER, isNotOver, sportIcon } from '../utils/constants'
import '../styles/explore.css'

const RADII = [5, 10, 25, 50, null] // null = any distance

export default function NearbyPage({ data, openEvent, notify }) {
  const [pos, setPos] = useState(null)
  const [radius, setRadius] = useState(25)
  const [locating, setLocating] = useState(false)

  async function locate() {
    setLocating(true)
    const p = await currentPosition()
    if (!p) notify('Location is blocked, so the map shows Fredericton. Allow location to see events near you.', 'info')
    setPos(p || DEFAULT_CENTER)
    setLocating(false)
  }

  useEffect(() => {
    locate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const nearby = useMemo(() => {
    return data.activities
      .filter((a) => a.coords && isNotOver(a))
      .map((a) => ({ ...a, distance: pos ? distanceKm(pos, a.coords) : null }))
      .filter((a) => radius == null || a.distance == null || a.distance <= radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
  }, [data.activities, pos, radius])

  const markers = useMemo(
    () =>
      nearby.map((a) => ({
        id: a.id,
        lat: a.coords.lat,
        lng: a.coords.lng,
        icon: sportIcon(a.sport?.name),
        title: a.title,
        variant: a.category === 'professional' ? 'pro' : '',
      })),
    [nearby]
  )

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Nearby me</p>
          <h1>Events around you</h1>
        </div>
        <button className="btn btn-dark" onClick={locate} disabled={locating}>
          <Icon name="locate" size={18} /> {locating ? 'Locating...' : 'Use my location'}
        </button>
      </header>

      <div className="chip-row">
        {RADII.map((r) => (
          <button key={r ?? 'any'} className={`chip ${radius === r ? 'active' : ''}`} onClick={() => setRadius(r)}>
            {r ? `Within ${r} km` : 'Any distance'}
          </button>
        ))}
      </div>

      <div className="nearby-layout">
        <div className="card map-card">
          <MapView markers={markers} userPos={pos} radiusKm={radius} onMarkerClick={openEvent} className="map-tall" />
        </div>

        <div className="nearby-list">
          <h2 className="list-title">
            {nearby.length} event{nearby.length === 1 ? '' : 's'} {radius ? `within ${radius} km` : 'on the map'}
          </h2>
          {nearby.length === 0 && (
            <div className="empty small">
              <div className="empty-icon"><Icon name="pin" size={26} /></div>
              <p className="muted">Nothing nearby yet. Try a bigger radius.</p>
            </div>
          )}
          {nearby.map((a) => (
            <EventCard key={a.id} activity={a} distance={a.distance} onOpen={openEvent} />
          ))}
        </div>
      </div>
    </div>
  )
}
