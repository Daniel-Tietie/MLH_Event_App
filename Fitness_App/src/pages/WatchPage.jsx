import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import FitnessSummary from '../components/FitnessSummary'
import '../styles/watch.css'

/**
 * Smartwatch pairing (DEMO: simulated, no real Bluetooth).
 * Why: in pro games people leave their phone in the bag, so safety check-ins and SOS
 * need to work from the wrist.
 */
const DEVICE = { name: 'Rally Watch', model: 'Series 9 · 45mm', battery: 82 }
const FEATURES = [
  {
    key: 'sos', icon: 'shield', title: 'Wrist SOS',
    text: 'Hold the side button for 3 seconds to send an SOS to your group and emergency contacts, with your location. No phone needed.',
  },
  {
    key: 'checkins', icon: 'check', title: 'Check-ins on your wrist',
    text: 'Safety check-ins buzz your watch. Tap "I\'m OK" without digging your phone out of your bag mid-game.',
  },
  {
    key: 'falls', icon: 'activity', title: 'Fall & no-movement alerts',
    text: 'If the watch detects a hard fall, or you stop moving on a run or ride, your group is asked to check on you.',
  },
  {
    key: 'heart', icon: 'heart', title: 'Heart rate & activity',
    text: 'Optional. Shared with the group only during the event, so a host can spot someone struggling. Never stored afterwards.',
  },
]

const STORE = 'rally-watch'
const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) } catch { return null } }
const save = (v) => { try { v ? localStorage.setItem(STORE, JSON.stringify(v)) : localStorage.removeItem(STORE) } catch { /* private mode */ } }

export default function WatchPage({ notify, session, data, openEvent }) {
  const saved = load()
  // idle -> searching -> found -> confirm -> paired
  const [step, setStep] = useState(saved ? 'paired' : 'idle')
  const [settings, setSettings] = useState(saved?.settings || { sos: true, checkins: true, falls: true, heart: false })
  const [code] = useState(() => String(Math.floor(100000 + Math.random() * 900000)))
  const [bpm, setBpm] = useState(72)

  useEffect(() => {
    if (step !== 'searching') return
    const t = setTimeout(() => setStep('found'), 2200)
    return () => clearTimeout(t)
  }, [step])

  // A gently changing heart rate on the watch face once paired
  useEffect(() => {
    if (step !== 'paired') return
    const t = setInterval(() => setBpm((b) => Math.max(64, Math.min(96, b + Math.round((Math.random() - 0.45) * 4)))), 1500)
    return () => clearInterval(t)
  }, [step])

  function confirm() {
    save({ device: DEVICE, settings })
    setStep('paired')
    notify(`${DEVICE.name} paired`, 'success')
  }
  function unpair() {
    save(null)
    setStep('idle')
    notify('Watch unpaired', 'info')
  }
  function toggle(key) {
    const next = { ...settings, [key]: !settings[key] }
    setSettings(next)
    save({ device: DEVICE, settings: next })
  }

  return (
    <div className="page watch-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Smartwatch</p>
          <h1>Safety on your wrist</h1>
        </div>
        <span className="pill"><Icon name="shield" size={12} /> Demo: pairing is simulated</span>
      </header>

      <section className="card watch-hero">
        <WatchArt step={step} code={code} bpm={bpm} />

        <div className="watch-panel">
          {step === 'idle' && (
            <>
              <h2>Pair your watch</h2>
              <p className="muted">
                In a real game your phone is in your bag. Pair a watch so check-ins and SOS still reach you on the court, the trail or the field.
              </p>
              <ul className="watch-compat muted small">
                <li>Apple Watch</li><li>Wear OS</li><li>Garmin</li><li>Fitbit</li>
              </ul>
              <button className="btn btn-primary btn-lg" onClick={() => setStep('searching')}>
                <Icon name="plus" size={18} /> Pair a watch
              </button>
            </>
          )}

          {step === 'searching' && (
            <>
              <h2>Looking for your watch…</h2>
              <p className="muted">Keep your watch close and unlocked, with Bluetooth on.</p>
              <button className="btn btn-ghost" onClick={() => setStep('idle')}>Cancel</button>
            </>
          )}

          {step === 'found' && (
            <>
              <h2>Watch found</h2>
              <button className="watch-device" onClick={() => setStep('confirm')}>
                <span className="watch-device-icon"><Icon name="watch" size={20} /></span>
                <span>
                  <strong>{DEVICE.name}</strong>
                  <span className="muted small">{DEVICE.model} · {DEVICE.battery}% battery</span>
                </span>
                <Icon name="right" size={18} />
              </button>
              <button className="btn btn-ghost" onClick={() => setStep('idle')}>Cancel</button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <h2>Check the code</h2>
              <p className="muted">Make sure this code matches the one on your watch, so you know you're pairing the right device.</p>
              <div className="watch-code">{code.slice(0, 3)} {code.slice(3)}</div>
              <div className="watch-actions">
                <button className="btn btn-ghost" onClick={() => setStep('idle')}>It doesn't match</button>
                <button className="btn btn-primary" onClick={confirm}>Codes match, pair</button>
              </div>
            </>
          )}

          {step === 'paired' && (
            <>
              <h2><span className="watch-dot" /> {DEVICE.name} is connected</h2>
              <p className="muted small">{DEVICE.model} · {DEVICE.battery}% battery · synced just now</p>
              <ul className="watch-toggles">
                {FEATURES.map((f) => (
                  <li key={f.key}>
                    <span>{f.title}</span>
                    <input type="checkbox" className="switch" checked={!!settings[f.key]} onChange={() => toggle(f.key)} aria-label={f.title} />
                  </li>
                ))}
              </ul>
              <button className="btn btn-ghost btn-sm" onClick={unpair}>Unpair watch</button>
            </>
          )}
        </div>
      </section>

      {step === 'paired' && (
        <FitnessSummary activities={data.activities} userId={session.user.id} deviceName={DEVICE.name} openEvent={openEvent} />
      )}

      <section className="section">
        <div className="section-head"><h2>What your watch does in Rally</h2></div>
        <div className="watch-features">
          {FEATURES.map((f) => (
            <article key={f.key} className="card watch-feature">
              <span className="watch-feature-icon"><Icon name={f.icon} size={20} /></span>
              <h3>{f.title}</h3>
              <p className="muted small">{f.text}</p>
            </article>
          ))}
        </div>
        <p className="muted small watch-privacy">
          <Icon name="shield" size={14} /> Your watch only shares data during events you've joined, and only what you switch on above. Nothing is kept after the event ends.
        </p>
      </section>
    </div>
  )
}

// Big watch illustration; the screen changes with each pairing step
function WatchArt({ step, code, bpm }) {
  return (
    <div className={`watch-art step-${step}`}>
      <div className="watch-strap watch-strap-top" />
      <div className="watch-case">
        <span className="watch-crown" />
        <span className="watch-button" />
        <div className="watch-screen">
          {step === 'idle' && (
            <>
              <span className="ws-logo">⚡</span>
              <span className="ws-title">Rally</span>
              <span className="ws-sub">Not paired</span>
            </>
          )}
          {step === 'searching' && (
            <div className="ws-rings"><span /><span /><span /><i className="ws-bt"><Icon name="bluetooth" size={20} /></i></div>
          )}
          {step === 'found' && (
            <>
              <span className="ws-sub">Pair with</span>
              <span className="ws-title">Rally?</span>
              <span className="ws-pill">Tap on phone</span>
            </>
          )}
          {step === 'confirm' && (
            <>
              <span className="ws-sub">Code</span>
              <span className="ws-code">{code.slice(0, 3)}<br />{code.slice(3)}</span>
            </>
          )}
          {step === 'paired' && (
            <>
              <span className="ws-time">{new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
              <span className="ws-heart"><Icon name="heart" size={26} /> {bpm}</span>
              <span className="ws-sub">bpm</span>
              <span className="ws-sos">Hold for SOS</span>
            </>
          )}
        </div>
      </div>
      <div className="watch-strap watch-strap-bottom" />
    </div>
  )
}
