// sport icons, line style to match the sidebar icons
// paths are from tabler icons (MIT license, tabler.io/icons)
const PATHS = {
  'bike': ["M2 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M16 18a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M12 19v-4l-3 -3l5 -4l2 3h3", "M13.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'run': ["M11.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0", "M4 17l5 1l.75 -1.5", "M15 21v-4l-4 -3l1 -6", "M7 12v-3l5 -1l3 3l3 1"],
  'trekking': ["M11 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M7 21l2 -4", "M13 21v-4l-3 -3l1 -6l3 4l3 2", "M10 14l-1.827 -1.218a2 2 0 0 1 -.831 -2.15l.28 -1.117a2 2 0 0 1 1.939 -1.515h1.439l4 1l3 -2", "M17 12v9", "M16 20h2"],
  'walk': ["M12 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M7 21l3 -4", "M16 21l-2 -4l-3 -3l1 -6", "M6 12l2 -3l4 -1l3 3l3 1"],
  'ball-basketball': ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M5.65 5.65l12.7 12.7", "M5.65 18.35l12.7 -12.7", "M12 3a9 9 0 0 0 9 9", "M3 12a9 9 0 0 1 9 9"],
  'ball-tennis': ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M6 5.3a9 9 0 0 1 0 13.4", "M18 5.3a9 9 0 0 0 0 13.4"],
  'ball-football': ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7l4.76 3.45l-1.76 5.55h-6l-1.76 -5.55l4.76 -3.45", "M12 7v-4m3 13l2.5 3m-.74 -8.55l3.74 -1.45m-11.44 7.05l-2.56 2.95m.74 -8.55l-3.74 -1.45"],
  'ball-american-football': ["M15 9l-6 6", "M10 12l2 2", "M12 10l2 2", "M8 21a5 5 0 0 0 -5 -5", "M16 3c-7.18 0 -13 5.82 -13 13a5 5 0 0 0 5 5c7.18 0 13 -5.82 13 -13a5 5 0 0 0 -5 -5", "M16 3a5 5 0 0 0 5 5"],
  'ball-volleyball': ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 12a8 8 0 0 0 8 4", "M7.5 13.5a12 12 0 0 0 8.5 6.5", "M12 12a8 8 0 0 0 -7.464 4.928", "M12.951 7.353a12 12 0 0 0 -9.88 4.111", "M12 12a8 8 0 0 0 -.536 -8.928", "M15.549 15.147a12 12 0 0 0 1.38 -10.611"],
  'swimming': ["M15 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M6 11l4 -2l3.5 3l-1.5 2", "M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25"],
  'yoga': ["M4 20h4l1.5 -3", "M17 20l-1 -5h-5l1 -7", "M4 10l4 -1l4 -1l4 1.5l4 1.5", "M10.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'mountain': ["M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612", "M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2"],
  'ping-pong': ["M12.718 20.713a7.64 7.64 0 0 1 -7.48 -12.755l.72 -.72a7.643 7.643 0 0 1 9.105 -1.283l2.387 -2.345a2.08 2.08 0 0 1 3.057 2.815l-.116 .126l-2.346 2.387a7.644 7.644 0 0 1 -1.052 8.864", "M11 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0", "M9.3 5.3l9.4 9.4"],
  'golf': ["M12 18v-15l7 4l-7 4", "M9 17.67c-.62 .36 -1 .82 -1 1.33c0 1.1 1.8 2 4 2s4 -.9 4 -2c0 -.5 -.38 -.97 -1 -1.33"],
  'disc': ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0", "M7 12a5 5 0 0 1 5 -5", "M12 17a5 5 0 0 0 5 -5"],
  'disc-golf': ["M5 5h14", "M6 5c.32 6.744 2.74 9.246 6 10", "M18 5c-.32 6.744 -2.74 9.246 -6 10", "M10 5c0 4.915 .552 7.082 2 10", "M14 5c0 4.915 -.552 7.082 -2 10", "M12 15v6", "M12 3v2", "M7 16c.64 .64 1.509 1 2.414 1h5.172c.905 0 1.774 -.36 2.414 -1", "M11 21h2"],
  'ball-baseball': ["M5.636 18.364a9 9 0 1 0 12.728 -12.728a9 9 0 0 0 -12.728 12.728", "M12.495 3.02a9 9 0 0 1 -9.475 9.475", "M20.98 11.505a9 9 0 0 0 -9.475 9.475", "M9 9l2 2", "M13 13l2 2", "M11 7l2 1", "M7 11l1 2", "M16 11l1 2", "M11 16l2 1"],
  'cricket': ["M11.105 18.79l-1 .992a4.159 4.159 0 0 1 -6.038 -5.715l.157 -.166l8.282 -8.401l1.5 1.5l3.45 -3.391a2.08 2.08 0 0 1 3.057 2.815l-.116 .126l-3.391 3.45l1.5 1.5l-3.668 3.617", "M10.5 7.5l6 6", "M11 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"],
  'ice-skating': ["M5.905 5h3.418a1 1 0 0 1 .928 .629l1.143 2.856a3 3 0 0 0 2.207 1.83l4.717 .926a2.084 2.084 0 0 1 1.682 2.045v.714a1 1 0 0 1 -1 1h-13.895a1 1 0 0 1 -1 -1.1l.8 -8a1 1 0 0 1 1 -.9", "M3 19h17a1 1 0 0 0 1 -1", "M9 15v4", "M15 15v4"],
  'ski-jumping': ["M17 17.5l-5 -4.5v-6l5 4", "M7 17.5l5 -4.5", "M15.103 21.58l6.762 -14.502a2 2 0 0 0 -.968 -2.657", "M8.897 21.58l-6.762 -14.503a2 2 0 0 1 .968 -2.657", "M7 11l5 -4", "M10.007 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'kayak': ["M6.414 6.414a2 2 0 0 0 0 -2.828l-1.414 -1.414l-2.828 2.828l1.414 1.414a2 2 0 0 0 2.828 0", "M17.586 17.586a2 2 0 0 0 0 2.828l1.414 1.414l2.828 -2.828l-1.414 -1.414a2 2 0 0 0 -2.828 0", "M6.5 6.5l11 11", "M22 2.5c-9.983 2.601 -17.627 7.952 -20 19.5c9.983 -2.601 17.627 -7.952 20 -19.5", "M6.5 12.5l5 5", "M12.5 6.5l5 5"],
  'skateboarding': ["M5.5 15h3.5l.75 -1.5", "M14 19v-5l-2.5 -3l2.5 -4", "M8 8l3 -1h4l1 3h3", "M17.5 21a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1", "M3 18c0 .552 .895 1 2 1h14c1.105 0 2 -.448 2 -1", "M6.5 21a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1", "M14.007 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'karate': ["M3 9l4.5 1l3 2.5", "M13 21v-8l3 -5.5", "M8 4.5l4 2l4 1l4 3.5l-2 3.5", "M15.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
  'barbell': ["M2 12h1", "M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2", "M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1", "M9 12h6", "M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1", "M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2", "M22 12h-1"],
  'bowling': ["M7 11v.01", "M11 10v.01", "M10 14v.01", "M11.059 6.07a8 8 0 1 0 .32 15.81", "M15.969 9h4", "M14.969 5c0 1.5 1 2 1 4c0 2.5 -2 4.5 -2 7c0 2.6 1.9 6 1.9 6h4.1s2 -3.4 2 -6c0 -2.5 -2 -4.5 -2 -7c0 -2 1 -2.5 1 -4a3 3 0 1 0 -6 0"],
  'medal': ["M12 4v3m-4 -3v6m8 -6v6", "M12 18.5l-3 1.5l.5 -3.5l-2 -2l3 -.5l1.5 -3l1.5 3l3 .5l-2 2l.5 3.5l-3 -1.5"],
  'map-pin': ["M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0", "M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0"],
}

// sport name -> icon, sports with no good icon fall back to their first letter
const SPORTS = {
  cycling: 'bike', running: 'run', 'trail running': 'run', hiking: 'trekking', walking: 'walk',
  basketball: 'ball-basketball', tennis: 'ball-tennis', squash: 'ball-tennis',
  football: 'ball-football', soccer: 'ball-football',
  'flag football': 'ball-american-football', rugby: 'ball-american-football',
  volleyball: 'ball-volleyball', spikeball: 'ball-volleyball',
  swimming: 'swimming', yoga: 'yoga', climbing: 'mountain',
  pickleball: 'ping-pong', 'table tennis': 'ping-pong', golf: 'golf',
  'ultimate frisbee': 'disc', 'disc golf': 'disc-golf',
  baseball: 'ball-baseball', softball: 'ball-baseball', cricket: 'cricket',
  'ice skating': 'ice-skating', skiing: 'ski-jumping', kayaking: 'kayak', rowing: 'kayak',
  skateboarding: 'skateboarding', 'martial arts': 'karate', 'gym workout': 'barbell', bowling: 'bowling',
}

const iconFor = (name = '') => SPORTS[name.toLowerCase()]

// sized in em so it scales with the font-size the old emoji used
export default function SportIcon({ name, icon, size = '1em' }) {
  const key = icon || iconFor(name)
  if (!key) return <span className="sport-letter">{(name || '?').charAt(0).toUpperCase()}</span>
  return (
    <svg className="sport-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[key].map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

// same icon as an html string, for leaflet map pins (they can't render react)
export function sportSvg(name, icon) {
  const key = icon || iconFor(name)
  if (!key) return `<b class="sport-letter">${(name || '?').charAt(0).toUpperCase()}</b>`
  const paths = PATHS[key].map((d) => `<path d="${d}"/>`).join('')
  return `<svg class="sport-icon" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}
