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
        <legend className="micro-label mb-2">{label}</legend>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <label
              key={option.value}
              className="segmented-option"
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
                disabled={disabled}
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