import { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [activities, setActivities] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)

        const { data: activitiesData, error: activitiesError } = await supabase
          .from('activities')
          .select('*')

        if (activitiesError) throw activitiesError

        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('*')

        if (profilesError) throw profilesError

        setActivities(activitiesData || [])
        setProfiles(profilesData || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1>🏆 Sports Activity Board</h1>
        <p>Live data fetched from Supabase</p>
      </header>

      {loading && <p style={{ textAlign: 'center' }}>Loading events...</p>}
      {error && <p style={{ color: '#ff6b6b' }}>Error: {error}</p>}

      {!loading && !error && (
        <main style={styles.grid}>
          {activities.map((activity) => (
            <div key={activity.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <span style={styles.badge}>{activity.sport}</span>
                <span style={{ ...styles.status, color: activity.status === 'open' ? '#4caf50' : '#f44336' }}>
                  ● {activity.status.toUpperCase()}
                </span>
              </div>

              <h2 style={styles.cardTitle}>{activity.title}</h2>
              <p style={styles.cardDetail}>📍 {activity.city}</p>
              <p style={styles.cardDetail}>⚡ Level: {activity.level_required}</p>

              <div style={styles.cardFooter}>
                <span>👥 {activity.joined_users?.length || 0} / {activity.participant_cap} Spots</span>
                <button style={styles.joinBtn}>Join</button>
              </div>
            </div>
          ))}
        </main>
      )}
    </div>
  )
}

// Simple Inline Styles
const styles = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
    padding: '2rem',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: '#e0e0e0',
  },
  header: {
    textAlign: 'center',
    marginBottom: '2rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '1.5rem',
  },
  card: {
    backgroundColor: '#1e1e24',
    borderRadius: '12px',
    padding: '1.25rem',
    border: '1px solid #333',
    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    display: 'flex',
    flexDirection: 'column',
    justify: 'space-between',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  badge: {
    backgroundColor: '#2a3b5c',
    color: '#646cff',
    padding: '0.25rem 0.6rem',
    borderRadius: '20px',
    fontSize: '0.8rem',
    fontWeight: 'bold',
  },
  status: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
  },
  cardTitle: {
    margin: '0 0 0.5rem 0',
    fontSize: '1.2rem',
    color: '#fff',
  },
  cardDetail: {
    margin: '0.25rem 0',
    fontSize: '0.9rem',
    color: '#aaa',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '1rem',
    paddingTop: '0.75rem',
    borderTop: '1px solid #333',
    fontSize: '0.85rem',
  },
  joinBtn: {
    backgroundColor: '#646cff',
    color: '#fff',
    border: 'none',
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}

export default App