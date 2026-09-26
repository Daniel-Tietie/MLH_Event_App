import { useState } from 'react'
import { acceptChallenge, clearChallenge } from '../services/activityService'
import '../styles/features.css'

// Team vs team: shows the opponent, or lets another team accept an open challenge
export default function ChallengeBox({ activity: a, isHost, ended, notify, onChange }) {
  const [team, setTeam] = useState('')
  const [busy, setBusy] = useState(false)

  async function accept(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await acceptChallenge(a.id, team)
    setBusy(false)
    if (error) return notify(error.message, 'error')
    notify(`Challenge accepted! ${team} vs ${a.host?.full_name || 'the host'}'s team ⚔️`, 'success')
    setTeam('')
    onChange()
  }

  async function reopen() {
    const { error } = await clearChallenge(a.id)
    if (error) return notify(error.message, 'error')
    notify('Challenge reopened for other teams', 'info')
    onChange()
  }

  if (a.opponent_team) {
    return (
      <div className="challenge accepted">
        <span className="challenge-icon">⚔️</span>
        <div>
          <strong>vs {a.opponent_team}</strong>
          <p>Challenge accepted</p>
        </div>
        {isHost && !ended && <button className="link-btn" onClick={reopen}>Reopen</button>}
      </div>
    )
  }

  return (
    <div className="challenge open">
      <span className="challenge-icon">⚔️</span>
      <div className="challenge-body">
        <strong>Open challenge</strong>
        <p>{isHost ? 'Waiting for a team to accept your challenge.' : 'Got a team? Take them on.'}</p>
        {!isHost && !ended && (
          <form className="challenge-form" onSubmit={accept}>
            <input placeholder="Your team name" value={team} maxLength={60} onChange={(e) => setTeam(e.target.value)} required />
            <button className="btn btn-yellow" disabled={busy || !team.trim()}>{busy ? '...' : 'Accept challenge'}</button>
          </form>
        )}
      </div>
    </div>
  )
}
