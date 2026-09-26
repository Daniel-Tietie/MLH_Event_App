// ---------- Reading locations from the database ----------
// Supabase returns PostGIS geography as hex (EWKB). This turns it into { lat, lng }.
export function parseLocation(value) {
  if (!value) return null
  if (typeof value === 'object' && value.coordinates) {
    return { lng: value.coordinates[0], lat: value.coordinates[1] }
  }
  if (typeof value !== 'string') return null

  const wkt = value.match(/POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i)
  if (wkt) return { lng: Number(wkt[1]), lat: Number(wkt[2]) }

  if (!/^[0-9a-f]+$/i.test(value) || value.length < 42) return null
  const bytes = new Uint8Array(value.match(/../g).map((h) => parseInt(h, 16)))
  const view = new DataView(bytes.buffer)
  const little = bytes[0] === 1
  const type = view.getUint32(1, little)
  let offset = 5
  if (type & 0x20000000) offset += 4 // skip SRID
  return { lng: view.getFloat64(offset, little), lat: view.getFloat64(offset + 8, little) }
}

// PostGIS point format for inserting into geography columns
export const toPoint = ({ lat, lng }) => `SRID=4326;POINT(${lng} ${lat})`

// Straight-line distance in km
export function distanceKm(a, b) {
  if (!a || !b) return null
  const R = 6371
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// ---------- Geocoding (free OpenStreetMap service, no API key) ----------
export async function geocode(query) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`)
    const [hit] = await res.json()
    return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
  } catch {
    return null
  }
}

export async function reverseGeocode({ lat, lng }) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`)
    const json = await res.json()
    const a = json.address || {}
    return {
      address: json.name || [a.house_number, a.road].filter(Boolean).join(' ') || (json.display_name || '').split(',')[0],
      city: a.city || a.town || a.village || a.municipality || a.county || '',
    }
  } catch {
    return null
  }
}

// The user's current location from the browser (null if blocked)
export function currentPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000 }
    )
  })
}
