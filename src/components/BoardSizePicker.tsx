import { useState } from 'react'
import { SegmentedControl } from './SegmentedControl'
import { MAX_DIMENSION, MIN_DIMENSION, normaliseBoardSize } from '../game/gameLogic'
import type { BoardSize } from '../game/types'

const PRESET_SIZES = [3, 4, 5, 6, 7, 8]
const LARGEST_PRESET = PRESET_SIZES[PRESET_SIZES.length - 1]

const SIZE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  ...PRESET_SIZES.map((size) => ({ value: `${size}x${size}`, label: `${size}×${size}` })),
  { value: 'custom', label: 'More…', hint: 'Pick any rows and columns from 3 to 10' },
]

export interface BoardSizePickerProps {
  boardSize: BoardSize
  onChange: (rows: number, cols: number) => void
  /** Radio group name - two pickers on one page must not share it. */
  name?: string
}

/**
 * The board size pills, the rows/columns steppers and the live badge.
 * Shared by the local settings rail and the online lobby.
 */
export function BoardSizePicker({ boardSize, onChange, name = 'board-size' }: BoardSizePickerProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const { rows, cols, winLength } = boardSize

  const isPreset = rows === cols && rows >= MIN_DIMENSION && rows <= LARGEST_PRESET
  const selected = customOpen || !isPreset ? 'custom' : `${cols}x${cols}`

  const handleChange = (value: string) => {
    if (value === 'custom') {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    const size = Number(value.split('x')[0])
    onChange(size, size)
  }

  return (
    <>
      <SegmentedControl
        label="Board size"
        name={name}
        value={selected}
        options={SIZE_OPTIONS}
        onChange={handleChange}
        className="board-size-fieldset scroll-tabs"
      />

      {selected === 'custom' ? (
        <div className="board-size-custom">
          <SizeStepper label="Rows" value={rows} onChange={(next) => onChange(next, cols)} />
          <span className="board-size-times" aria-hidden="true">
            ×
          </span>
          <SizeStepper label="Columns" value={cols} onChange={(next) => onChange(rows, next)} />
        </div>
      ) : null}

      <p className="board-size-badge">
        {rows}×{cols} • {winLength} to win
        {normaliseBoardSize(rows, cols) === null ? ' • Max 100 cells' : ''}
      </p>
    </>
  )
}

interface SizeStepperProps {
  label: string
  value: number
  onChange: (value: number) => void
}

/** `[-] 4 [+]` number stepper, clamped to the accepted dimensions. */
function SizeStepper({ label, value, onChange }: SizeStepperProps) {
  return (
    <div className="board-size-stepper">
      <span className="micro-label">{label}</span>
      <div className="board-size-stepper-row">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          disabled={value <= MIN_DIMENSION}
          onClick={() => onChange(value - 1)}
          className="board-size-step"
        >
          −
        </button>
        <output className="board-size-value" aria-label={`${label} ${value}`}>
          {value}
        </output>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          disabled={value >= MAX_DIMENSION}
          onClick={() => onChange(value + 1)}
          className="board-size-step"
        >
          +
        </button>
      </div>
    </div>
  )
}
