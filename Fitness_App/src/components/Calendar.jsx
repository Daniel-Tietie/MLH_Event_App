import Icon from './Icon'
import { dayKey } from '../utils/constants'
import '../styles/calendar.css'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOT_COLORS = ['#6b3ff2', '#22b07d', '#f28b66', '#3b82f6']
const monthName = (d) => d.toLocaleDateString([], { month: 'long' })

/**
 * month:        Date (any day in the month being shown)
 * selected:     "YYYY-MM-DD"
 * eventsByDay:  { "YYYY-MM-DD": [events] }  -> dots under each day
 */
export default function Calendar({ month, onMonthChange, selected, onSelect, eventsByDay = {} }) {
  const year = month.getFullYear()
  const m = month.getMonth()
  const prev = new Date(year, m - 1, 1)
  const next = new Date(year, m + 1, 1)
  const todayKey = dayKey(new Date())

  // Grid starts on the Monday on/before the 1st
  const first = new Date(year, m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const cellCount = Math.ceil((offset + daysInMonth) / 7) * 7
  const cells = Array.from({ length: cellCount }, (_, i) => new Date(year, m, 1 - offset + i))

  return (
    <div className="calendar">
      <div className="cal-months">
        <button className="cal-arrow" onClick={() => onMonthChange(prev)} aria-label="Previous month">
          <Icon name="left" size={18} />
        </button>
        <button className="cal-month faded prev" onClick={() => onMonthChange(prev)}>{monthName(prev)}</button>
        <span className="cal-month current">
          {monthName(month)} <small>{year}</small>
        </span>
        <button className="cal-month faded" onClick={() => onMonthChange(next)}>{monthName(next)}</button>
        <button className="cal-arrow" onClick={() => onMonthChange(next)} aria-label="Next month">
          <Icon name="right" size={18} />
        </button>
      </div>

      <div className="cal-grid">
        {WEEKDAYS.map((w) => (
          <span key={w} className="cal-weekday">{w}</span>
        ))}

        {cells.map((date) => {
          const key = dayKey(date)
          const events = eventsByDay[key] || []
          const outside = date.getMonth() !== m
          const classes = [
            'cal-day',
            outside && 'outside',
            key === selected && 'selected',
            key === todayKey && 'today',
          ].filter(Boolean).join(' ')

          return (
            <button key={key} className={classes} onClick={() => onSelect(key, date)}>
              {key === todayKey && <span className="cal-today">Today</span>}
              <span className="cal-num">{date.getDate()}</span>
              <span className="cal-dots">
                {events.slice(0, 3).map((e, i) => (
                  <i key={e.id} style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
