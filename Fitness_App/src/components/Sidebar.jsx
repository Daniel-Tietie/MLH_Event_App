import Icon from './Icon'
import { Avatar } from './Avatar'
import { APP_NAME } from '../utils/constants'
import { signOut } from '../services/authService'
import '../styles/layout.css'

const NAV = [
  { id: 'explore', label: 'Explore', icon: 'compass' },
  { id: 'nearby', label: 'Nearby me', icon: 'pin' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'mine', label: 'My events', icon: 'ticket' },
  { id: 'friends', label: 'Friends', icon: 'users' },
  { id: 'create', label: 'Host an event', icon: 'plusSquare' },
  { id: 'profile', label: 'My profile', icon: 'user' },
]

// Left menu on desktop, slide-out drawer on phones
export default function Sidebar({ user, active, onNavigate, open, onClose, badges = {} }) {
  const name = user.user_metadata?.full_name || 'Player'

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-mark">⚡</span>
            {APP_NAME}
          </div>
          <button className="icon-btn icon-btn-orange drawer-close" onClick={onClose} aria-label="Close menu">
            <Icon name="x" />
          </button>
        </div>

        <button className="user-card" onClick={() => onNavigate('profile')}>
          <Avatar name={name} url={user.user_metadata?.avatar_url} size={42} />
          <div className="user-card-text">
            <strong>{name}</strong>
            <span>{user.email}</span>
          </div>
        </button>

        <nav className="side-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`side-link ${active === item.id ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
              {badges[item.id] > 0 && <span className="side-badge">{badges[item.id]}</span>}
            </button>
          ))}
        </nav>

        <button className="btn btn-dark btn-block side-signout" onClick={signOut}>
          <Icon name="logout" /> Sign out
        </button>
      </aside>
    </>
  )
}
