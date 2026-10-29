import Icon from './Icon'
import { Avatar } from './Avatar'
import { APP_NAME } from '../utils/constants'

// Only shows on phones (the sidebar replaces it on desktop)
export default function Topbar({ user, onMenu, onHome }) {
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={onMenu} aria-label="Open menu">
        <Icon name="menu" />
      </button>
      <button type="button" className="brand brand-home" onClick={onHome} aria-label="Go to Explore">
        <span className="brand-mark"><Icon name="zap" size="1.1em" /></span>
        {APP_NAME}
      </button>
      <Avatar name={user.user_metadata?.full_name || user.email} url={user.user_metadata?.avatar_url} size={38} />
    </header>
  )
}
