// "Group radar": everyone's distance from the group, no map needed.
// Green = with the group, red = too far away, blue = you, yellow = host.
//
// members: [{ id, name, x, y, state, showLabel }]  x/y in metres from the group's centre
// radiusM: how far someone can be before they're flagged
const MAX_M = 150 // outer ring
const R = 150 // svg units for the outer ring
const RINGS = [50, 100, 150]

export default function GroupRadar({ members, radiusM }) {
  const k = R / MAX_M

  return (
    <div className="radar">
      <svg viewBox="-165 -165 330 330" role="img" aria-label="Group radar showing how far each member is from the group">
        <defs>
          <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#22c55e" stopOpacity="0" />
            <stop offset="1" stopColor="#22c55e" stopOpacity="0.28" />
          </linearGradient>
        </defs>

        {/* Safe zone */}
        <circle r={radiusM * k} className="radar-safe" />

        {/* Distance rings + crosshair */}
        {RINGS.map((m) => (
          <g key={m}>
            <circle r={m * k} className="radar-ring" />
            <text x={4} y={-m * k + 11} className="radar-ring-label">{m} m</text>
          </g>
        ))}
        <line x1={-R} y1="0" x2={R} y2="0" className="radar-axis" />
        <line x1="0" y1={-R} x2="0" y2={R} className="radar-axis" />

        {/* Rotating sweep */}
        <g>
          <path d={`M0 0 L${R} 0 A${R} ${R} 0 0 0 ${R * Math.cos(0.7)} ${-R * Math.sin(0.7)} Z`} fill="url(#radar-sweep)" />
          <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="-360 0 0" dur="4s" repeatCount="indefinite" />
        </g>

        {/* People */}
        {/* Labelled people (you, host, alerts) drawn last so they sit on top */}
        {[...members].sort((a, b) => Number(a.showLabel) - Number(b.showLabel)).map((m) => {
          const d = Math.hypot(m.x, m.y) * k
          const scale = d > R ? R / d : 1 // pin anyone beyond the outer ring to its edge
          const x = m.x * k * scale
          const y = -m.y * k * scale
          const alert = m.state === 'outside' || m.state === 'sos'
          return (
            <g key={m.id} className={`radar-dot ${m.state}`} style={{ transform: `translate(${x}px, ${y}px)` }}>
              {alert && <circle r="15" className="radar-pulse" />}
              <circle r="7" className="radar-core" />
              {m.showLabel && (
                <text y="-13" textAnchor="middle" className="radar-label">
                  {m.name}{alert ? ' ⚠️' : ''}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
