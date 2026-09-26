import { initials, sportColors } from '../utils/constants'

export function Avatar({ name, url, size = 36 }) {
  const [bg] = sportColors(name || '?')
  return (
    <span className="avatar" style={{ width: size, height: size, background: bg, fontSize: size < 32 ? size * 0.42 : size * 0.36 }} title={name}>
      {url ? <img src={url} alt="" /> : size < 32 ? initials(name).slice(0, 1) : initials(name)}
    </span>
  )
}

// Overlapping faces like "👤👤👤 9+"
export function AvatarStack({ people = [], max = 3, size = 30 }) {
  const shown = people.slice(0, max)
  const extra = people.length - shown.length
  if (!people.length) return <span className="avatar-empty">Be the first</span>

  return (
    <span className="avatar-stack">
      {shown.map((p) => (
        <Avatar key={p.user_id} name={p.profile?.full_name} url={p.profile?.avatar_url} size={size} />
      ))}
      {extra > 0 && (
        <span className="avatar avatar-more" style={{ width: size, height: size, fontSize: size * 0.34 }}>
          {extra}+
        </span>
      )}
    </span>
  )
}
