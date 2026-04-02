import { Modal } from './Modal'
import { Button } from './Button'
export function ConfirmModal({ open, onClose, onConfirm, title, message, loading, danger }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <p style={{ fontSize:"0.9rem", color:"var(--text-secondary)", marginTop:"-0.25rem" }}>{message}</p>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose} disabled={loading}>Cancel</Button>
        <Button variant={danger?'danger':'primary'} size="sm" onClick={onConfirm} loading={loading}>Confirm</Button>
      </div>
    </Modal>
  )
}
