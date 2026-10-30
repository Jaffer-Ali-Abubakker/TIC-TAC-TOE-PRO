import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export interface DialogProps {
  open: boolean
  title: string
  description?: string
  /** Keeps the description for screen readers only (it is rendered elsewhere). */
  hideDescription?: boolean
  onClose: () => void
  children: ReactNode
  /** Optional explicit close button label. */
  closeLabel?: string
}

/**
 * Accessible modal dialog.
 *
 * - Uses `role="dialog"` with `aria-modal` and labelled by its title.
 * - Moves focus into the dialog on open and restores it to the trigger on close.
 * - Traps Tab / Shift+Tab inside the dialog.
 * - Closes on Escape.
 * - Prevents background scrolling while open.
 */
export function Dialog({
  open,
  title,
  description,
  hideDescription = false,
  onClose,
  children,
  closeLabel = 'Close dialog',
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const descriptionId = useId()

  const getFocusable = useCallback((): HTMLElement[] => {
    const panel = panelRef.current
    if (!panel) return []
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true',
    )
  }, [])

  useEffect(() => {
    if (!open) return

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusable = getFocusable()
    const target = focusable[0] ?? panelRef.current
    target?.focus()

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }

      if (event.key !== 'Tab') return

      const items = getFocusable()
      if (items.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.body.style.overflow = originalOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose, getFocusable])

  if (!open) return null

  return (
    <div className="dialog-overlay">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="dialog-panel animate-dialog-pop"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold tracking-tight text-text">
              {title}
            </h2>
            {description && !hideDescription ? (
              <p id={descriptionId} className="mt-1 text-[13px] leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
            {description && hideDescription ? (
              <p id={descriptionId} className="sr-only">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 rounded-lg border border-border bg-white/40 p-2 text-text transition-colors duration-150 hover:bg-white/60"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">{children}</div>
      </div>
    </div>
  )
}