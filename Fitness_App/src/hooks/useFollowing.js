import { useEffect, useState } from 'react'
import { fetchFollowing } from '../services/activityService'

// Who I follow, shared across pages. Call refreshFollowing() after follow/unfollow.
let current = new Set()
const listeners = new Set()
let loadedFor = null

export function refreshFollowing(userId) {
  loadedFor = userId
  return fetchFollowing(userId).then((s) => {
    current = s
    listeners.forEach((fn) => fn(s))
    return s
  })
}

export function useFollowing(userId) {
  const [following, setFollowing] = useState(current)
  useEffect(() => {
    listeners.add(setFollowing)
    if (loadedFor !== userId) refreshFollowing(userId)
    else setFollowing(current)
    return () => listeners.delete(setFollowing)
  }, [userId])
  return following
}
