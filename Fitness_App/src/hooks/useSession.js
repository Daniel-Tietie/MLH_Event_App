import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// Tracks the signed-in user. `ready` is false until the first check finishes.
export function useSession() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  return { session, ready }
}
