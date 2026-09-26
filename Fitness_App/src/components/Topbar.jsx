import Icon from './Icon'
import { Avatar } from './Avatar'
import { APP_NAME } from '../utils/constants'

// Only shows on phones (the sidebar replaces it on desktop)
export default function Topbar({ user, onMenu }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" />
      </button>
      <div className="brand">
        <span className="brand-mark">⚡</span>
        {APP_NAME}
      </div>
      <Avatar name={user.user_metadata?.full_name || user.email} size={38} />
    </header>
  )
}
