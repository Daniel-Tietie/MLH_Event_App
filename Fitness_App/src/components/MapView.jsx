import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { DEFAULT_CENTER } from '../utils/constants'
import '../styles/map.css'

// Free OpenStreetMap tiles. No API key needed.
const CARTO_KEY = import.meta.env.VITE_CARTO_KEY
const TILES = CARTO_KEY
  ? `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = CARTO_KEY ? '&copy; OpenStreetMap contributors &copy; CARTO' : '&copy; OpenStreetMap contributors'

const pinIcon = (emoji, variant = '') =>
  L.divIcon({
    className: '',
    html: `<div class="map-pin ${variant}"><span>${emoji}</span></div>`,
    iconSize: [40, 48],
    iconAnchor: [20, 46],
  })

const youIcon = L.divIcon({ className: '', html: '<div class="map-you"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })

/**
 * markers:  [{ id, lat, lng, icon, title, variant }]  event pins
 * picked:   { lat, lng }  the pin a host drops (Create page)
 * userPos:  { lat, lng }  blue "you are here" dot
 * radiusKm: draws a circle around userPos
 * onPick(coords):     called when the map is clicked
 * onMarkerClick(id):  called when an event pin is clicked
 */
export default function MapView({
  markers = [],
  picked,
  userPos,
  radiusKm,
  center,
  zoom = 13,
  onPick,
  onMarkerClick,
  className = '',
}) {
  const el = useRef(null)
  const map = useRef(null)
  const layers = useRef({})
  const handlers = useRef({})
  const fittedKey = useRef('')
  handlers.current = { onPick, onMarkerClick }

  // Create the map once
  useEffect(() => {
    const start = center || picked || userPos || DEFAULT_CENTER
    const m = L.map(el.current, { scrollWheelZoom: true }).setView([start.lat, start.lng], zoom)
    L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: CARTO_KEY ? 20 : 19 }).addTo(m)
    layers.current = {
      events: L.layerGroup().addTo(m),
      picked: L.layerGroup().addTo(m),
      you: L.layerGroup().addTo(m),
    }
    m.on('click', (e) => handlers.current.onPick?.({ lat: e.latlng.lat, lng: e.latlng.lng }))
    map.current = m
    const t = setTimeout(() => m.invalidateSize(), 200) // fixes grey tiles when shown inside tabs/drawers
    return () => {
      clearTimeout(t)
      m.remove()
      map.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Event pins
  useEffect(() => {
    const m = map.current
    if (!m) return
    layers.current.events.clearLayers()
    const points = []
    markers.forEach((mk) => {
      if (mk.lat == null) return
      const marker = L.marker([mk.lat, mk.lng], { icon: pinIcon(mk.icon || '📍', mk.variant) })
      if (mk.title) marker.bindTooltip(mk.title, { direction: 'top', offset: [0, -42] })
      marker.on('click', () => handlers.current.onMarkerClick?.(mk.id))
      marker.addTo(layers.current.events)
      points.push([mk.lat, mk.lng])
    })
    // Zoom to fit pins, but only when the set of pins changes (not on every refresh)
    if (userPos) points.push([userPos.lat, userPos.lng])
    const key = markers.map((mk) => mk.id).join(',') + (userPos ? `@${userPos.lat},${userPos.lng}` : '')
    if (markers.length && key !== fittedKey.current) {
      fittedKey.current = key
      if (points.length === 1) m.setView(points[0], 15)
      else m.fitBounds(points, { padding: [50, 50], maxZoom: 15 })
    }
  }, [markers, userPos])

  // Host's dropped pin
  useEffect(() => {
    const m = map.current
    if (!m) return
    layers.current.picked.clearLayers()
    if (picked) {
      L.marker([picked.lat, picked.lng], { icon: pinIcon('📍', 'picked') }).addTo(layers.current.picked)
      m.setView([picked.lat, picked.lng], Math.max(m.getZoom(), 15))
    }
  }, [picked?.lat, picked?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  // "You are here" + radius circle
  useEffect(() => {
    const m = map.current
    if (!m) return
    layers.current.you.clearLayers()
    if (!userPos) return
    L.marker([userPos.lat, userPos.lng], { icon: youIcon, interactive: false }).addTo(layers.current.you)
    if (radiusKm) {
      const circle = L.circle([userPos.lat, userPos.lng], {
        radius: radiusKm * 1000,
        color: '#6b3ff2',
        weight: 1.5,
        fillColor: '#6b3ff2',
        fillOpacity: 0.06,
      }).addTo(layers.current.you)
      // No pins to zoom to? Show the whole search radius instead
      if (!markers.length) m.fitBounds(circle.getBounds(), { padding: [20, 20] })
    } else if (!markers.length) {
      m.setView([userPos.lat, userPos.lng], 12)
    }
  }, [userPos?.lat, userPos?.lng, radiusKm]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recenter when asked
  useEffect(() => {
    if (center && map.current) map.current.setView([center.lat, center.lng], map.current.getZoom())
  }, [center?.lat, center?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={`map ${className}`} />
}
