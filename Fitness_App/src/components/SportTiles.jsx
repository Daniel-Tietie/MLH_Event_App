import { sportColors, sportIcon } from '../utils/constants'

// "All Category" grid with pastel blobs behind each sport icon
export default function SportTiles({ sports, counts, total, selected, onSelect }) {
  // Only sports that have upcoming events (plus the one selected), busiest first, so a long
  // sports list doesn't bury the page
  const withEvents = sports
    .map((s) => ({ ...s, count: counts[s.id] || 0 }))
    .filter((s) => s.count > 0 || String(s.id) === String(selected))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  const tiles = [{ id: '', name: 'All sports', count: total }, ...withEvents]

  return (
    <div className="tiles">
      {tiles.map((t) => {
        const [a, b] = t.id ? sportColors(t.name) : ['#dcd3ff', '#fde9a9']
        return (
          <button
            key={t.id || 'all'}
            className={`tile ${String(selected) === String(t.id) ? 'active' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <span className="tile-art">
              <span className="blob blob-a" style={{ background: a }} />
              <span className="blob blob-b" style={{ background: b }} />
              <span className="tile-emoji">{t.id ? sportIcon(t.name) : '🏅'}</span>
            </span>
            <strong>{t.name}</strong>
            <small>{t.count} event{t.count === 1 ? '' : 's'}</small>
          </button>
        )
      })}
    </div>
  )
}
