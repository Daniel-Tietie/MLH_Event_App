import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Avatar } from '../components/Avatar'
import { getProfile, setUserSports, updateProfile, verifyIdentityMock } from '../services/api'
import { fetchActivityHistory } from '../services/activityService'
import { formatDate, sportColors, sportIcon } from '../utils/constants'
import EmergencyContacts from '../components/EmergencyContacts'
import { reliabilityLevel, useReliability } from '../components/Reliability'
import '../styles/social.css'
import '../styles/features.css'
import '../styles/safety.css'

const LEVELS = [
  ['casual', 'Casual'],
  ['competitive', 'Competitive'],
  ['d2', 'D2'],
  ['d1', 'D1'],
  ['professional', 'Professional'],
  ['ex_player', 'Ex-player'],
  ['retired', 'Retired'],
]

export default function ProfilePage({ session, data, notify, openEvent }) {
  const [profile, setProfile] = useState(null)
  const [form, setForm] = useState({ fullName: '', city: '', bio: '' })
  const [mySports, setMySports] = useState({}) // { sportId: level }
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState(null)
  const [history, setHistory] = useState(null)

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p)
        setForm({ fullName: p.fullName || '', city: p.city || '', bio: p.bio || '' })
        setMySports(Object.fromEntries(p.sports.map((s) => [s.sportId, s.level])))
      })
      .catch((e) => setError(e.message))
    fetchActivityHistory(session.user.id)
      .then(setHistory)
      .catch(() => setHistory([]))
  }, [session.user.id])

  const myScore = useReliability([session.user.id])[session.user.id]

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  function toggleSport(id) {
    setMySports((cur) => {
      const next = { ...cur }
      if (next[id]) delete next[id]
      else next[id] = 'casual'
      return next
    })
  }

  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await updateProfile(form)
      const updated = await setUserSports(
        Object.entries(mySports).map(([sportId, level]) => ({ sportId: Number(sportId), level }))
      )
      setProfile(updated)
      notify('Profile saved', 'success')
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  // DEMO ONLY: no real ID check happens and no document is stored
  async function verify() {
    setVerifying(true)
    await new Promise((r) => setTimeout(r, 1500))
    try {
      setProfile(await verifyIdentityMock())
      notify('ID verified ✔', 'success')
    } catch (err) {
      notify(err.message, 'error')
    }
    setVerifying(false)
  }

  if (!profile) {
    return <div className="page">{error ? <p className="form-error">{error}</p> : <p className="muted">Loading profile...</p>}</div>
  }

  return (
    <div className="page profile">
      <header className="profile-head card">
        <Avatar name={form.fullName} url={profile.avatarUrl} size={76} />
        <div>
          <h1>{form.fullName || 'Your profile'}</h1>
          <p className="muted">{form.city || 'Add your city'}</p>
          {profile.isVerified ? (
            <span className="verified verified-lg"><Icon name="check" size={14} /> ID verified</span>
          ) : (
            <span className="pill">Not verified</span>
          )}
        </div>
      </header>

      {!profile.isVerified && (
        <div className="verify-card card">
          <Icon name="shield" size={28} />
          <div>
            <h3>Verify your identity</h3>
            <p className="muted small">
              Verified members get a badge, so hosts and players know you are who you say you are.
              In the full version a secure ID provider checks your driver's licence, and we never store the image.
              (Demo: this step is simulated.)
            </p>
          </div>
          <button className="btn btn-yellow" onClick={verify} disabled={verifying}>
            {verifying ? 'Checking licence...' : 'Verify with licence'}
          </button>
        </div>
      )}

      <ReliabilityCard stat={myScore} />

      <form className="card form" onSubmit={save}>
        <h3 className="form-section">About you</h3>
        <div className="row">
          <input placeholder="Full name" value={form.fullName} onChange={set('fullName')} required />
          <input placeholder="City" value={form.city} onChange={set('city')} />
        </div>
        <textarea rows={3} placeholder="Short bio: what you play, when you're free, what you're looking for" value={form.bio} onChange={set('bio')} />

        <h3 className="form-section">Sports you play</h3>
        <p className="muted small">Tap to add, then set your level. This powers recommendations.</p>
        <div className="sport-picks">
          {data.sports.map((s) => (
            <button
              type="button"
              key={s.id}
              className={`chip ${mySports[s.id] ? 'active' : ''}`}
              onClick={() => toggleSport(s.id)}
            >
              {sportIcon(s.name)} {s.name}
            </button>
          ))}
        </div>

        {Object.keys(mySports).length > 0 && (
          <ul className="level-list">
            {data.sports.filter((s) => mySports[s.id]).map((s) => (
              <li key={s.id}>
                <span>{sportIcon(s.name)} {s.name}</span>
                <select
                  value={mySports[s.id]}
                  onChange={(e) => setMySports({ ...mySports, [s.id]: e.target.value })}
                  aria-label={`${s.name} level`}
                >
                  {LEVELS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="form-error">{error}</p>}

        <button className="btn btn-primary btn-block btn-lg" disabled={saving}>
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </form>

      <EmergencyContacts userId={session.user.id} notify={notify} />

      <section className="section">
        <div className="section-head">
          <h2>Activity history <span className="count">{history?.length ?? 0}</span></h2>
        </div>
        {history === null ? (
          <p className="muted">Loading...</p>
        ) : history.length === 0 ? (
          <div className="empty small">
            <div className="empty-icon"><Icon name="award" size={26} /></div>
            <p className="muted">Events you check in to (or host) show up here, with your comments.</p>
          </div>
        ) : (
          <div className="history">
            {history.map((h) => (
              <article key={h.id} className="history-item" onClick={() => openEvent(h.id)}>
                <div className="ecard-icon" style={{ background: sportColors(h.sport)[0] }}>{sportIcon(h.sport)}</div>
                <div>
                  <div className="history-top">
                    <h4>{h.title}</h4>
                    {h.role === 'host'
                      ? <span className="pill pill-host">Hosted</span>
                      : <span className="pill pill-green"><Icon name="check" size={12} /> Attended</span>}
                  </div>
                  <p className="muted small">{h.sport} · {h.city} · {formatDate(h.starts_at)}</p>
                  {h.review && <p className="history-quote">"{h.review}"</p>}
                  {h.photos?.length > 0 && (
                    <div className="history-photos">
                      {h.photos.slice(0, 4).map((url) => <img key={url} src={url} alt="" loading="lazy" />)}
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// Your own show-up record at pro events (hosts of pro events you join see the same number)
function ReliabilityCard({ stat }) {
  const { tone, pct } = reliabilityLevel(stat)
  const ring = { good: 'var(--green)', ok: '#e0a800', bad: 'var(--danger)', new: 'var(--border)' }[tone]
  return (
    <div className="card rel-card">
      <div className={`rel-ring ${pct == null ? 'is-new' : ''}`} style={{ '--p': pct ?? 0, '--ring': ring }}>
        <span>{pct == null ? '🎯' : `${pct}%`}</span>
      </div>
      <div>
        <h3>Pro show-up score</h3>
        <p className="muted small">
          {pct == null
            ? 'Join a pro event and check in with your QR code to build your score. Hosts of pro events use it to approve players.'
            : `You checked in to ${stat.showed} of ${stat.joined} pro events you signed up for. Hosts of pro events can see this.`}
        </p>
      </div>
    </div>
  )
}
