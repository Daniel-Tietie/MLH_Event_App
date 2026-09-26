import { useEffect } from 'react'
import Icon from './Icon'

// Small pop-up message. type: 'success' | 'error' | 'info'
export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onClose, 4500)
    return () => clearTimeout(t)
  }, [toast, onClose])

  if (!toast) return null

  return (
    <div className={`toast toast-${toast.type || 'info'}`} role="status">
      <span>{toast.message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss">
        <Icon name="x" size={16} />
      </button>
    </div>
  )
}
