import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

export interface RailSectionProps {
  title: string
  children: ReactNode
}

/**
 * A panel that collapses behind a toggle on phones and stays open in the
 * desktop side rail. CSS decides which; the markup is the same for both.
 */
export function RailSection({ title, children }: RailSectionProps) {
  const [open, setOpen] = useState(false)

  return (
    <section className="rail-section">
      <button
        type="button"
        className="rail-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {title}
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
      <div className={`rail-section-body${open ? '' : ' is-collapsed'}`}>{children}</div>
    </section>
  )
}
