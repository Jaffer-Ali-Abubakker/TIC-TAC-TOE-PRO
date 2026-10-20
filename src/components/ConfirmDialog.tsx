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
      <div className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900/70 p-3">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
            destructive ? 'bg-rose-500/15 text-glow-rose' : 'bg-glow-cyan/15 text-glow-cyan'
          }`}
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
        </span>
        <p className="text-sm leading-relaxed text-mist-300">{description}</p>
      </div>

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-ink-700 bg-ink-850 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:border-ink-600 hover:text-mist-100"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
            destructive
              ? 'bg-rose-500/90 text-white hover:bg-rose-500'
              : 'bg-gradient-to-r from-glow-cyan to-glow-violet text-ink-950 hover:brightness-110'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
