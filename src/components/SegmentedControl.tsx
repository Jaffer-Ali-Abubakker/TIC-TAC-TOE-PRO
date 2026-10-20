import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  hint?: string
}

export interface SegmentedControlProps<T extends string> {
  label: string
  name: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (value: T) => void
  disabled?: boolean
  /** Renders the legend above the options. Set to `false` to hide it. */
  showLabel?: boolean
  className?: string
}

/**
 * Radio group built from native radio inputs, so keyboard support (arrow keys,
 * space) comes for free while still looking like a segmented control.
 */
export function SegmentedControl<T extends string>({
  label,
  name,
  value,
  options,
  onChange,
  disabled = false,
  showLabel = true,
  className = '',
}: SegmentedControlProps<T>) {
  return (
    <fieldset className={className} disabled={disabled}>
      {showLabel ? (
        <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">
          {label}
        </legend>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className="segmented-option inline-flex flex-1 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-ink-700 bg-ink-850/80 px-3 py-2 text-sm font-medium text-mist-400 transition-colors duration-150 hover:border-ink-600 hover:text-mist-200"
              data-selected={selected}
              title={option.hint}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.icon}
              <span>{option.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
