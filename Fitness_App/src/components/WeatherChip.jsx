import { useEffect, useState } from 'react'
import { eventWeather } from '../services/weatherService'

// Short label for the worst thing about the forecast (null = looks fine)
function headline(w) {
  if (w.code >= 95) return { icon: '⛈️', text: 'Storms' }
  if ((w.code >= 71 && w.code <= 77) || w.code === 85 || w.code === 86) return { icon: '🌨️', text: 'Snow' }
  if (w.rain >= 60) return { icon: '🌧️', text: `Rain ${w.rain}%` }
  if (w.tempMin <= 0) return { icon: '🥶', text: 'Freezing' }
  if (w.tempMax >= 30) return { icon: '🥵', text: 'Hot' }
  if (w.wind >= 40) return { icon: '💨', text: 'Windy' }
  return null
}

/**
 * Small weather chip that sits on the event's hero banner.
 * Normal: "🌤️ 14°C · 10% rain". Bad weather: orange "🌧️ 7°C · Rain 80%".
 * Tap to see the details (temperature range, wind, tips).
 */
export default function WeatherChip({ activity: a }) {
  const [w, setW] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let alive = true
    setW(null)
    setOpen(false)
    eventWeather(a).then((r) => alive && setW(r)).catch(() => alive && setW(null))
    return () => { alive = false }
  }, [a.id, a.starts_at, a.ends_at, a.coords?.lat, a.coords?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!w || w.tooFar) return null
  const bad = headline(w)
  const range = w.tempMin === w.tempMax ? `${w.temp}°C` : `${w.tempMin}–${w.tempMax}°C`

  return (
    <div className="wx">
      <button
        className={`wx-chip ${bad ? 'wx-bad' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`${w.label}, ${range}, ${w.rain}% rain, wind ${w.wind} km/h`}
      >
        <span>{bad ? bad.icon : w.emoji}</span>
        {w.temp}°C · {bad ? bad.text : `${w.rain}% rain`}
      </button>
      {open && (
        <div className="wx-pop" role="dialog">
          <strong>{w.emoji} {w.label}</strong>
          <span>{range} during the event</span>
          <span>💧 {w.rain}% rain · 💨 {w.wind} km/h</span>
          {w.warnings.map((t) => <p key={t}>{t}</p>)}
        </div>
      )}
    </div>
  )
}
