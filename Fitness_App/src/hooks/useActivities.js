import { useCallback, useEffect, useState } from 'react'
import { fetchActivities, fetchProfiles, fetchSports } from '../services/activityService'
import { parseLocation } from '../utils/geo'

// Loads every event once, shares it with all pages, and refreshes every 10 seconds.
// Each event gets:
//   coords -> { lat, lng } for the map
//   people -> participants with their profile (name, avatar)
export function useActivities() {
  const [activities, setActivities] = useState([])
  const [sports, setSports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const { data, error } = await fetchActivities()
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    const rows = data || []
    const ids = [...new Set(rows.flatMap((a) => (a.activity_participants || []).map((p) => p.user_id)))]
    const profiles = {}
    if (ids.length) {
      const { data: people } = await fetchProfiles(ids)
      ;(people || []).forEach((p) => (profiles[p.id] = p))
    }

    setActivities(
      rows.map((a) => ({
        ...a,
        coords: parseLocation(a.location),
        people: (a.activity_participants || []).map((p) => ({ ...p, profile: profiles[p.user_id] })),
      }))
    )
    setError(null)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchSports().then(({ data }) => setSports(data || []))
    reload()
    const timer = setInterval(reload, 10000)
    return () => clearInterval(timer)
  }, [reload])

  return { activities, sports, loading, error, reload }
}
