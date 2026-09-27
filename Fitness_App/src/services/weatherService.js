// Forecast from Open-Meteo: free, no API key, works from the browser.
// Gives up to 16 days ahead, hour by hour, so we can show the weather for the exact event time.

const API = 'https://api.open-meteo.com/v1/forecast'
const MAX_DAYS = 16
const cache = new Map() // "lat,lng,date" -> promise (one request per place+day)

const utcDay = (d) => d.toISOString().slice(0, 10)
const utcHour = (d) => d.toISOString().slice(0, 13) + ':00' // "2026-09-28T11:00", same as Open-Meteo in GMT

// WMO weather codes -> label + emoji
export function describe(code) {
  if (code === 0) return ['Clear', '☀️']
  if (code <= 2) return ['Partly cloudy', '🌤️']
  if (code === 3) return ['Cloudy', '☁️']
  if (code === 45 || code === 48) return ['Fog', '🌫️']
  if (code >= 51 && code <= 57) return ['Drizzle', '🌦️']
  if (code >= 61 && code <= 67) return ['Rain', '🌧️']
  if (code >= 71 && code <= 77) return ['Snow', '🌨️']
  if (code >= 80 && code <= 82) return ['Showers', '🌧️']
  if (code === 85 || code === 86) return ['Snow showers', '🌨️']
  if (code >= 95) return ['Thunderstorms', '⛈️']
  return ['Mixed', '🌥️']
}

function fetchDays(lat, lng, from, to) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)},${from},${to}`
  if (!cache.has(key)) {
    const url = `${API}?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,weather_code,wind_speed_10m&timezone=GMT&start_date=${from}&end_date=${to}`
    const req = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Weather unavailable'))))
      .catch((e) => { cache.delete(key); throw e })
    cache.set(key, req)
  }
  return cache.get(key)
}

/**
 * Weather during the event (start -> end, max 4 h window).
 * Resolves to null if we can't forecast it, { tooFar: true } if it's more than 16 days out,
 * otherwise { temp, tempMin, tempMax, rain, wind, code, label, emoji, warnings[] }.
 */
export async function eventWeather({ coords, starts_at, ends_at }) {
  if (!coords) return null
  const start = new Date(starts_at)
  const end = new Date(Math.min(new Date(ends_at || start.getTime() + 2 * 3600e3).getTime(), start.getTime() + 4 * 3600e3))
  const daysAway = (start.getTime() - Date.now()) / 86400e3
  if (daysAway > MAX_DAYS - 1) return { tooFar: true }
  if (end.getTime() < Date.now()) return null

  const data = await fetchDays(coords.lat, coords.lng, utcDay(start), utcDay(end))
  const h = data?.hourly
  if (!h?.time) return null

  // Hours that overlap the event
  const first = h.time.indexOf(utcHour(start))
  if (first < 0) return null
  let last = h.time.indexOf(utcHour(end))
  if (last < first) last = first
  const pick = (arr) => arr.slice(first, last + 1).filter((v) => v != null)

  const temps = pick(h.temperature_2m)
  const rains = pick(h.precipitation_probability)
  const winds = pick(h.wind_speed_10m)
  const codes = pick(h.weather_code)
  const worstCode = Math.max(...codes, h.weather_code[first] ?? 0)
  const code = worstCode >= 51 ? worstCode : h.weather_code[first] // show rain/snow/storm if it hits during the event
  const [label, emoji] = describe(code)

  const w = {
    temp: Math.round(h.temperature_2m[first]),
    tempMin: Math.round(Math.min(...temps)),
    tempMax: Math.round(Math.max(...temps)),
    rain: rains.length ? Math.max(...rains) : 0,
    wind: Math.round(winds.length ? Math.max(...winds) : 0),
    code, label, emoji,
  }

  const warnings = []
  if (code >= 95) warnings.push('Thunderstorms expected. Stay off open fields and trails if you hear thunder.')
  else if (w.rain >= 60) warnings.push(`${w.rain}% chance of rain. Bring a jacket, and hosts may want a backup plan.`)
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) warnings.push('Snow expected. Watch for slippery ground.')
  if (w.tempMin <= 0) warnings.push(`Freezing (${w.tempMin}°C). Dress in layers.`)
  if (w.tempMax >= 30) warnings.push(`Hot (${w.tempMax}°C). Bring extra water and take breaks.`)
  if (w.wind >= 40) warnings.push(`Strong wind, up to ${w.wind} km/h.`)
  w.warnings = warnings
  return w
}
