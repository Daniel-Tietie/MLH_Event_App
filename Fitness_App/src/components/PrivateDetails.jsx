import { useEffect, useState } from 'react'
import Icon from './Icon'
import { fetchMyDetails, setMyDetails } from '../services/activityService'
import { adultCutoff, GENDER_OPTIONS } from '../utils/constants'

const genderLabel = (g) => GENDER_OPTIONS.find(([v]) => v === g)?.[1] || 'Not set'
const prettyDate = (d) => new Date(`${d}T12:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })

// Profile: date of birth + gender. Only the owner can read these; they're used to check
// eligibility for age-group and women's/men's events and are never shown to anyone.
// Saved details are masked on screen (someone could be looking over your shoulder).
export default function PrivateDetails({ userId, notify }) {
  const [form, setForm] = useState({ birthDate: '', gender: '' })
  const [saved, setSaved] = useState(null)
  const [editing, setEditing] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchMyDetails(userId).then((d) => {
      const v = { birthDate: d?.birth_date || '', gender: d?.gender || '' }
      setForm(v)
      setSaved(v)
    })
  }, [userId])

  // Hide the date again after 10 seconds
  useEffect(() => {
    if (!reveal) return
    const t = setTimeout(() => setReveal(false), 10000)
    return () => clearTimeout(t)
  }, [reveal])

  const changed = saved && (form.birthDate !== saved.birthDate || form.gender !== saved.gender)

  async function save(e) {
    e.preventDefault()
    if (form.birthDate && form.birthDate > adultCutoff()) return notify('You need to be 18 or older to use Rally.', 'error')
    setBusy(true)
    try {
      await setMyDetails(form.birthDate, form.gender)
      setSaved(form)
      setEditing(false)
      notify('Private details saved', 'success')
    } catch (err) {
      notify(err.message, 'error')
    }
    setBusy(false)
  }

  if (!saved) return null
  const hasAny = saved.birthDate || saved.gender
  // Once Woman / Man / Non-binary is saved it can't be changed here (stops switching to get into events)
  const genderLocked = ['woman', 'man', 'non_binary'].includes(saved.gender)
  const showForm = editing || !hasAny

  return (
    <section className="card form private-card">
      <div className="contacts-head">
        <h3 className="form-section"><Icon name="shield" size={18} /> Private details</h3>
        {!showForm && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(true); setReveal(false) }}>Edit</button>
        )}
      </div>
      <p className="muted small">
        Never shown to anyone, including hosts. Only used to check if you can join age-group or women's / men's events.
      </p>

      {showForm ? (
        <form className="private-form" onSubmit={save}>
          {!saved.birthDate && <p className="private-nudge small">Add your date of birth to join age-group events.</p>}
          {!genderLocked && (
            <p className="muted small">Heads up: once you pick Woman, Man or Non-binary, it's locked so nobody can switch just to get into an event.</p>
          )}
          <div className="row">
            <label className="field-labelled">
              <span>Date of birth</span>
              <input type="date" value={form.birthDate} max={adultCutoff()} min="1910-01-01" onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </label>
            <label className="field-labelled">
              <span>Gender{genderLocked && <em> · locked</em>}</span>
              <select value={form.gender} disabled={genderLocked} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                {GENDER_OPTIONS.map(([v, l]) => <option key={v} value={v}>{v ? l : 'Not set'}</option>)}
              </select>
            </label>
          </div>
          <div className="private-actions">
            {hasAny && (
              <button type="button" className="btn btn-ghost" onClick={() => { setForm(saved); setEditing(false) }}>Cancel</button>
            )}
            <button className="btn btn-dark" disabled={busy || !changed}>{busy ? 'Saving...' : 'Save private details'}</button>
          </div>
        </form>
      ) : (
        <dl className="private-view">
          <div>
            <dt>Date of birth</dt>
            <dd>
              {saved.birthDate ? (
                <>
                  <span className={reveal ? '' : 'masked'}>{reveal ? prettyDate(saved.birthDate) : '•• ••• ••••'}</span>
                  <button type="button" className="link-btn reveal-btn" onClick={() => setReveal((v) => !v)}>{reveal ? 'Hide' : 'Show'}</button>
                </>
              ) : <span className="muted">Not set</span>}
            </dd>
          </div>
          <div>
            <dt>Gender{genderLocked && ' · locked'}</dt>
            <dd>{genderLabel(saved.gender)}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}