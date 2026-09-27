import { useMemo, useState } from 'react'
import Icon from '../components/Icon'
import Calendar from '../components/Calendar'
import EventCard from '../components/EventCard'
import { dayKey } from '../utils/constants'
import '../styles/explore.css'

export default function CalendarPage({ data, openEvent, navigate }) {
  const [month, setMonth] = useState(() => new Date())
  const [selected, setSelected] = useState(() => dayKey(new Date()))

  const eventsByDay = useMemo(() => {
    const map = {}
    data.activities
      .filter((a) => a.status !== 'cancelled')
      .forEach((a) => (map[dayKey(a.starts_at)] ||= []).push(a))
    return map
  }, [data.activities])

  const dayEvents = eventsByDay[selected] || []
  const label = new Date(`${selected}T12:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })

  function pick(key, date) {
    setSelected(key)
    if (date.getMonth() !== month.getMonth()) setMonth(date)
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Plan ahead</p>
          <h1>Calendar</h1>
        </div>
        <button className="link-btn" onClick={() => navigate('create', { date: selected })}>
          <Icon name="plus" size={18} /> Add new event
        </button>
      </header>

      <div className="calendar-layout">
        <div className="card calendar-card">
          <Calendar month={month} onMonthChange={setMonth} selected={selected} onSelect={pick} eventsByDay={eventsByDay} />
        </div>

        <div className="day-list">
          <h2 className="list-title">{label}</h2>
          {dayEvents.length === 0 ? (
            <div className="empty small">
              <div className="empty-icon"><Icon name="calendar" size={26} /></div>
              <p className="muted">Nothing planned for this day.</p>
              <button className="btn btn-primary" onClick={() => navigate('create', { date: selected })}>
                Host something
              </button>
            </div>
          ) : (
            <div className="day-scroll">
              {dayEvents.map((a) => <EventCard key={a.id} activity={a} onOpen={openEvent} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
