import { QRCodeSVG } from 'qrcode.react'
import Icon from './Icon'

export default function QrModal({ qr, onClose }) {
  if (!qr) return null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn icon-btn-pink modal-close" onClick={onClose} aria-label="Close">
          <Icon name="x" />
        </button>
        <p className="eyebrow">Your check-in pass</p>
        <h3>{qr.title}</h3>
        <div className="qr-frame">
          <QRCodeSVG value={qr.url} size={210} />
        </div>
        <p className="muted small">Show this to the host when you arrive. They scan it to confirm it's really you.</p>
        <button className="btn btn-yellow btn-block" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
