import { TriangleAlert } from 'lucide-react'
import { Dialog } from './Dialog'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Confirmation dialog used before destructive or state discarding actions. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      hideDescription
      onClose={onCancel}
      closeLabel="Cancel"
    >
      <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
            destructive ? 'bg-rose/20 text-rose' : 'bg-lime/20 text-lime'
          }`}
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
        </span>
        <p className="text-[13px] leading-relaxed text-text">{description}</p>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`btn ${destructive ? 'btn-danger' : 'btn-primary'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}