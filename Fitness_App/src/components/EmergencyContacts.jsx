import { useEffect, useState } from 'react'
import Icon from './Icon'
import { addContact, fetchContacts, removeContact } from '../services/safetyService'

// Private list of people to call/text in an emergency. Only the owner can see it.
export default function EmergencyContacts({ userId, notify }) {
  const [contacts, setContacts] = useState([])
  const [form, setForm] = useState({ name: '', phone: '' })
  const [busy, setBusy] = useState(false)

  const load = () => fetchContacts().then(setContacts).catch((e) => notify(e.message, 'error'))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim()) return
    setBusy(true)
    try {
      await addContact(userId, form.name.trim(), form.phone.trim())
      setForm({ name: '', phone: '' })
      await load()
    } catch (err) {
      notify(err.message, 'error')
    }
    setBusy(false)
  }

  async function remove(id) {
    try {
      await removeContact(id)
      setContacts((c) => c.filter((x) => x.id !== id))
    } catch (err) {
      notify(err.message, 'error')
    }
  }

  return (
    <section className="card form contacts-card">
      <div className="contacts-head">
        <h3 className="form-section">Emergency contacts</h3>
        <span className="pill"><Icon name="shield" size={12} /> Private, only you can see these</span>
      </div>
      <p className="muted small">Shown on your SOS screen during events so you can call or text your location in one tap.</p>

      {contacts.length > 0 && (
        <ul className="contact-list">
          {contacts.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <span>{c.phone}</span>
              </div>
              <button className="icon-btn" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
                <Icon name="x" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="row" onSubmit={add}>
        <input placeholder="Name (e.g. Mom)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input type="tel" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <button className="btn btn-dark" disabled={busy}>Add</button>
      </form>
    </section>
  )
}
