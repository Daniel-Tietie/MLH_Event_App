// Demo movement for the Live safety radar.
// In the real app these offsets would come from each phone's GPS, relative to the group.

// How far the "wanderer" has drifted from the group at time t (seconds). Repeats every 60 s.
export function wanderDrift(t) {
  const c = t % 60
  if (c < 12) return 0
  if (c < 22) return (c - 12) * 11 // walking away
  if (c < 34) return 110 // too far
  if (c < 44) return 110 - (c - 34) * 11 // coming back
  return 0
}

// Position (metres from the group's centre) for member number idx at time t
export function groupOffset(idx, t, { isHost = false, isWanderer = false } = {}) {
  const angle = idx * 2.4 + t * 0.06 * (idx % 2 ? 1 : -1)
  let r = isHost ? 4 : 10 + ((idx * 9) % 26) + 3 * Math.sin(t * 0.6 + idx)
  if (isWanderer) r += wanderDrift(t)
  return { x: r * Math.cos(angle), y: r * Math.sin(angle), dist: r }
}
