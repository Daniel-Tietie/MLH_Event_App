import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from './hooks/useSession'
import { useActivities } from './hooks/useActivities'
import { fetchCommentedIds, fetchRequestUpdates, fetchUnreadDmCount, subscribeDms, fetchWaitingCounts, getMyQrToken, hostCheckIn, joinActivity, leaveActivity, markRequestSeen, setActivityStatus } from './services/activityService'
import Sidebar from './components/Sidebar'
import Topbar from './components/Topbar'
import Toast from './components/Toast'
import QrModal from './components/QrModal'
import Notifications from './components/Notifications'
import AuthPage from './pages/AuthPage'
import ExplorePage from './pages/ExplorePage'
import NearbyPage from './pages/NearbyPage'
import CalendarPage from './pages/CalendarPage'
import MyEventsPage from './pages/MyEventsPage'
import EventDetailPage from './pages/EventDetailPage'
import CreateEventPage from './pages/CreateEventPage'
import ProfilePage from './pages/ProfilePage'
import FriendsPage from './pages/FriendsPage'
import LiveSafetyPage from './pages/LiveSafetyPage'
import { endEvent, extendEvent, fetchSafeCheckouts, recordSafety } from './services/safetyService'
import { isNotOver } from './utils/constants'

export default function App() {
  const { session, ready } = useSession()

  if (!ready) return <div className="splash"><div className="spinner" /></div>
  if (!session) return <AuthPage />
  return <Main session={session} />
}

// ---------- URL routing ----------
// Every page has its own URL, e.g. #/calendar or #/event/<id>,
// so the browser back button, refresh, and shared links all work.
const VIEWS = ['explore', 'nearby', 'calendar', 'mine', 'friends', 'create', 'profile', 'event', 'live']

function readRoute() {
  const [path, query = ''] = window.location.hash.replace(/^#\/?/, '').split('?')
  const [view, id] = path.split('/')
  const params = new URLSearchParams(query)
  return { view: VIEWS.includes(view) ? view : 'explore', id, date: params.get('date'), focus: params.get('focus') }
}

function Main({ session }) {
  const data = useActivities()
  const [route, setRoute] = useState(readRoute)
  const [drawer, setDrawer] = useState(false)
  const [toast, setToast] = useState(null)
  const [qr, setQr] = useState(null)
  const lastSection = useRef('explore') // which sidebar item to highlight on event pages

  const view = route.view
  if (view !== 'event' && view !== 'live') lastSection.current = view

  const notify = useCallback((message, type = 'info') => setToast({ message, type }), [])
  const clearToast = useCallback(() => setToast(null), [])

  // Browser back/forward buttons
  useEffect(() => {
    if (!window.history.state) window.history.replaceState({ depth: 0 }, '', window.location.href)
    const onPop = () => {
      setRoute(readRoute())
      setDrawer(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function go(hash) {
    if (hash === window.location.hash) return setDrawer(false)
    const depth = (window.history.state?.depth || 0) + 1
    window.history.pushState({ depth }, '', hash)
    setRoute(readRoute())
    setDrawer(false)
    window.scrollTo(0, 0)
  }

  const navigate = (next, options = null) => go(`#/${next}${options?.date ? `?date=${options.date}` : ''}`)
  const openEvent = (id, focus) => go(`#/event/${id}${focus ? `?focus=${focus}` : ''}`)
  const openLive = (id) => go(`#/live/${id}`)

  // In-app back buttons: go back in history if we came from inside the app
  function goBack() {
    if ((window.history.state?.depth || 0) > 0) window.history.back()
    else navigate(lastSection.current === 'event' ? 'explore' : lastSection.current)
  }

  // QR check-in: the host scans an attendee's QR with their phone camera,
  // which opens /?checkin=<token> while the host is signed in
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('checkin')
    if (!token) return
    hostCheckIn(token).then(({ data: name, error }) => {
      if (error) notify(`Check-in failed: ${error.message}`, 'error')
      else notify(`✅ ${name} is checked in`, 'success')
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.hash)
      data.reload()
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps


  // ---------- "How was it?" notifications ----------
  // After an event (start + 2h), people who checked in (and the host) get a prompt to comment.
  const [commented, setCommented] = useState(() => new Set())
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('rally-dismissed') || '[]')) } catch { return new Set() }
  })

  const candidates = useMemo(() => {
    const uid = session.user.id
    const now = Date.now()
    return data.activities.filter((a) => {
      const start = new Date(a.starts_at).getTime()
      const attended = a.host_id === uid || a.people.some((p) => p.user_id === uid && p.status === 'checked_in')
      const end = a.ends_at ? new Date(a.ends_at).getTime() : start + 2 * 3600e3
      const over = a.status === 'completed' || now > end
      return attended && over && now < start + 7 * 86400e3
    })
  }, [data.activities, session.user.id])
  const candidateKey = candidates.map((a) => a.id).join(',')

  useEffect(() => {
    if (!candidateKey) return
    fetchCommentedIds(session.user.id, candidateKey.split(','))
      .then((ids) => setCommented((cur) => new Set([...cur, ...ids])))
      .catch(() => {})
  }, [candidateKey, session.user.id])

  const prompts = candidates.filter((a) => !commented.has(a.id) && !dismissed.has(a.id))

  function dismissPrompt(id) {
    setDismissed((cur) => {
      const next = new Set([...cur, id])
      try { localStorage.setItem('rally-dismissed', JSON.stringify([...next])) } catch { /* private mode */ }
      return next
    })
  }
  const markCommented = (id) => setCommented((cur) => new Set([...cur, id]))

  // ---------- "Did you get home safe?" ----------
  // For every event type: once it ends, people who were there confirm they got home safe.
  const [checkedOut, setCheckedOut] = useState(() => new Set())
  const homeCandidates = useMemo(() => {
    const uid = session.user.id
    const now = Date.now()
    return data.activities.filter((a) => {
      const start = new Date(a.starts_at).getTime()
      const end = a.ends_at ? new Date(a.ends_at).getTime() : start + 2 * 3600e3
      const wasThere = a.host_id === uid || a.people.some((p) => p.user_id === uid && p.status === 'checked_in')
      // Ended by the host, or 30 min past the planned end (grace for games that run late)
      const over = a.status === 'completed' || now > end + 30 * 60e3
      return wasThere && over && now < end + 12 * 3600e3
    })
  }, [data.activities, session.user.id])
  const homeKey = homeCandidates.map((a) => a.id).join(',')

  useEffect(() => {
    if (!homeKey) return
    fetchSafeCheckouts(session.user.id, homeKey.split(','))
      .then((ids) => setCheckedOut((cur) => new Set([...cur, ...ids])))
      .catch(() => {})
  }, [homeKey, session.user.id])

  const homeChecks = homeCandidates.filter((a) => !checkedOut.has(a.id))
  const homeActions = {
    safe: async (a) => {
      setCheckedOut((cur) => new Set([...cur, a.id]))
      await recordSafety(a.id, session.user.id, 'safe')
      notify('Thanks! Glad you got home safe 👋', 'success')
    },
    help: (a) => go(`#/live/${a.id}`),
  }

  // Runs a database action, shows a message, then refreshes
  async function run(request, successMessage) {
    const { error } = await request
    if (error) notify(error.message, 'error')
    else if (successMessage) notify(successMessage, 'success')
    data.reload()
  }

  const actions = {
    join: (id) => run(joinActivity(id), "You're in! 🎉"),
    leave: (id) => run(leaveActivity(id), 'You left the event'),
    setStatus: (id, status) => run(setActivityStatus(id, status), status === 'closed' ? 'Sign-ups closed' : 'Sign-ups reopened'),
    showQr: async (activity) => {
      const { data: token, error } = await getMyQrToken(activity.id)
      if (error || !token) return notify(error?.message || 'No check-in code found', 'error')
      setQr({ title: activity.title, url: `${window.location.origin}/?checkin=${token}` })
    },
  }

  // ---------- Waitlist + join requests ----------
  // Player: "a spot opened, you're in" / "approved" / "declined". Host: "N requests waiting" on pro events.
  const [reqUpdates, setReqUpdates] = useState([])
  const [waitingCounts, setWaitingCounts] = useState({})
  const [reqSnoozed, setReqSnoozed] = useState({})
  const hostedProKey = data.activities
    .filter((a) => a.host_id === session.user.id && a.category === 'professional' && isNotOver(a))
    .map((a) => a.id).join(',')

  useEffect(() => {
    const load = () => {
      fetchRequestUpdates(session.user.id).then(setReqUpdates)
      if (hostedProKey) fetchWaitingCounts(hostedProKey.split(',')).then(setWaitingCounts)
    }
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [session.user.id, hostedProKey])

  const byId = (id) => data.activities.find((a) => a.id === id)
  const updates = reqUpdates
    .map((u) => ({ ...u, activity: byId(u.activity_id) }))
    .filter((u) => u.activity && ['promoted', 'approved', 'denied'].includes(u.status))
  const hostRequests = Object.entries(waitingCounts)
    .map(([id, c]) => ({ activity: byId(id), count: c.request }))
    .filter((r) => r.activity && r.count > 0 && !(reqSnoozed[r.activity.id] > Date.now()) && !(view === 'event' && route.id === r.activity.id))
  const updateActions = {
    dismiss: (a) => {
      setReqUpdates((cur) => cur.filter((u) => u.activity_id !== a.id))
      markRequestSeen(a.id).catch(() => {})
    },
    open: (a) => { updateActions.dismiss(a); openEvent(a.id) },
  }
  const hostActions = {
    review: (a) => { setReqSnoozed((s) => ({ ...s, [a.id]: Date.now() + 30 * 60e3 })); openEvent(a.id, 'requests') },
    snooze: (a) => setReqSnoozed((s) => ({ ...s, [a.id]: Date.now() + 30 * 60e3 })),
  }

  // ---------- Direct messages: unread count for the sidebar ----------
  const [dmUnread, setDmUnread] = useState(0)
  const viewRef = useRef(view)
  viewRef.current = view
  const refreshUnread = useCallback(() => fetchUnreadDmCount(session.user.id).then(setDmUnread), [session.user.id])
  useEffect(() => {
    refreshUnread()
    const off = subscribeDms(session.user.id, (m) => {
      refreshUnread()
      if (viewRef.current !== 'friends') notify('New message from a friend 💬', 'info')
    })
    const t = setInterval(refreshUnread, 15000)
    return () => { off(); clearInterval(t) }
  }, [refreshUnread]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Host "time's up" ----------
  // When an event reaches its end time, the host chooses: end it, or add 30 minutes.
  const [snoozed, setSnoozed] = useState({})
  const timeups = data.activities.filter(
    (a) =>
      a.host_id === session.user.id &&
      (a.status === 'open' || a.status === 'closed') &&
      a.ends_at &&
      Date.now() >= new Date(a.ends_at).getTime() &&
      !(snoozed[a.id] > Date.now())
  )
  const timeupActions = {
    end: (a) => run(endEvent(a.id), `${a.title} has ended. Nice work!`),
    extend: (a) => run(extendEvent(a.id, a.ends_at, 30), 'Extended by 30 minutes'),
    snooze: (a) => setSnoozed((s) => ({ ...s, [a.id]: Date.now() + 10 * 60e3 })),
  }

  const shared = { session, data, actions, notify, navigate, openEvent, openLive, goBack }

  return (
    <div className="shell">
      <Sidebar
        user={session.user}
        active={view === 'event' ? lastSection.current : view}
        onNavigate={navigate}
        open={drawer}
        onClose={() => setDrawer(false)}
        badges={{ friends: dmUnread }}
      />

      <div className="main">
        <Topbar user={session.user} onMenu={() => setDrawer(true)} />
        <main className="content">
          {view === 'explore' && <ExplorePage {...shared} />}
          {view === 'nearby' && <NearbyPage {...shared} />}
          {view === 'calendar' && <CalendarPage {...shared} />}
          {view === 'mine' && <MyEventsPage {...shared} />}
          {view === 'profile' && <ProfilePage {...shared} />}
          {view === 'friends' && <FriendsPage {...shared} focus={route.focus} dmUnread={dmUnread} refreshUnread={refreshUnread} />}
          {view === 'create' && <CreateEventPage key={route.date || 'new'} {...shared} preset={{ date: route.date }} onCreated={() => { data.reload(); navigate('mine') }} />}
          {view === 'live' && (
            <LiveSafetyPage {...shared} event={data.activities.find((a) => a.id === route.id)} />
          )}
          {view === 'event' && (
            <EventDetailPage {...shared} event={data.activities.find((a) => a.id === route.id)} onBack={goBack} focus={route.focus} onCommented={markCommented} />
          )}
        </main>
      </div>

      {view !== 'live' && <Notifications timeups={timeups} timeupActions={timeupActions} homeChecks={homeChecks} homeActions={homeActions} items={view === 'event' && route.focus === 'comments' ? prompts.filter((p) => p.id !== route.id) : prompts} onOpen={(id) => openEvent(id, 'comments')} onDismiss={dismissPrompt} updates={updates} updateActions={updateActions} hostRequests={hostRequests} hostActions={hostActions} />}
      <QrModal qr={qr} onClose={() => { setQr(null); data.reload() }} />
      <Toast toast={toast} onClose={clearToast} />
    </div>
  )
}
