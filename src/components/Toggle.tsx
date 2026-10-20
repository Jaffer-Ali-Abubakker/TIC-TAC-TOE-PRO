import { useId } from 'react'

export interface ToggleProps {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

/** Accessible switch built on a native button with the `switch` role. */
export function Toggle({ label, description, checked, onChange, disabled = false }: ToggleProps) {
  const labelId = useId()
  const descriptionId = useId()

  return (
    <div className="flex items-start justify-between gap-4">
      <span className="min-w-0">
        <span id={labelId} className="block text-sm font-medium text-mist-100">
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs leading-relaxed text-mist-500">
            {description}
          </span>
        ) : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? 'border-glow-cyan/60 bg-glow-cyan/30' : 'border-ink-600 bg-ink-800'
        }`}
      >
        <span
          aria-hidden="true"
          className={`inline-block size-4 transform rounded-full transition-transform duration-150 ${
            checked ? 'translate-x-6 bg-glow-cyan' : 'translate-x-1 bg-mist-500'
          }`}
        />
      </button>
    </div>
  )
}
