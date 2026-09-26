import { sportColors, sportIcon } from '../utils/constants'

// "All Category" grid with pastel blobs behind each sport icon
export default function SportTiles({ sports, counts, total, selected, onSelect }) {
  const tiles = [{ id: '', name: 'All sports', count: total }, ...sports.map((s) => ({ ...s, count: counts[s.id] || 0 }))]

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
