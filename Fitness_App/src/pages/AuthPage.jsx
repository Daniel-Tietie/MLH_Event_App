import { useState } from 'react'
import { signIn, signUp } from '../services/authService'
import { APP_NAME, TAGLINE, GENDER_OPTIONS, adultCutoff } from '../utils/constants'
import '../styles/auth.css'

const SHOWCASE = [
  { emoji: '🚴', name: 'Cycling', count: '12 rides', a: '#fde9a9', b: '#cfdcff' },
  { emoji: '🏀', name: 'Basketball', count: '8 games', a: '#f8cfdc', b: '#fde0c8' },
  { emoji: '🥾', name: 'Hiking', count: '5 trails', a: '#cdeedd', b: '#cfdcff' },
  { emoji: '🎾', name: 'Tennis', count: '9 matches', a: '#dcd3ff', b: '#f8cfdc' },
]

export default function AuthPage() {
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ fullName: '', email: '', password: '', birthDate: '', gender: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    if (isSignup && form.birthDate > adultCutoff()) {
      setBusy(false)
      return setError('You need to be 18 or older to join Rally.')
    }
    const { error } = isSignup
      ? await signUp(form.email, form.password, form.fullName, form.birthDate, form.gender)
      : await signIn(form.email, form.password)
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand brand-lg">
          <span className="brand-mark">⚡</span>
          {APP_NAME}
        </div>
        <h1>{TAGLINE}</h1>
        <p className="auth-sub">
          Find people nearby to run, ride, and play with, whether you're a weekend jogger or an ex-D1 athlete.
        </p>

        <div className="showcase">
          {SHOWCASE.map((s) => (
            <div key={s.name} className="tile">
              <span className="tile-art">
                <span className="blob blob-a" style={{ background: s.a }} />
                <span className="blob blob-b" style={{ background: s.b }} />
                <span className="tile-emoji">{s.emoji}</span>
              </span>
              <strong>{s.name}</strong>
              <small>{s.count}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="auth-panel">
        <form className="card auth-card" onSubmit={handleSubmit}>
          <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">{isSignup ? 'Join your local sports community.' : 'Sign in to find your next game.'}</p>

          {isSignup && <input placeholder="Full name*" value={form.fullName} onChange={set('fullName')} required />}
          {isSignup && (
            <div className="row">
              <label className="field-labelled">
                <span>Date of birth*</span>
                <input type="date" value={form.birthDate} onChange={set('birthDate')} max={adultCutoff()} min="1910-01-01" required />
              </label>
              <label className="field-labelled">
                <span>Gender</span>
                <select value={form.gender} onChange={set('gender')}>
                  {GENDER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          )}
          {isSignup && <p className="muted small auth-private">Private: never shown to anyone. Only used for 18+ and for age-group or women's/men's games.</p>}
          <input type="email" placeholder="Email*" value={form.email} onChange={set('email')} required />
          <input type="password" minLength={6} placeholder="Password (6+ characters)*" value={form.password} onChange={set('password')} required />

          {error && <p className="form-error">{error}</p>}

          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy ? 'Please wait...' : isSignup ? 'Create account' : 'Sign in'}
          </button>

          <p className="auth-switch">
            {isSignup ? 'Already have an account?' : 'New here?'}{' '}
            <button type="button" className="link" onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(null) }}>
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </p>
        </form>
      </section>
    </div>
  )
}
