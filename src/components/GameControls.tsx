import { useState, type ReactNode } from 'react'
import { Gauge, RotateCcw, Trophy } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { MAX_DIMENSION, MIN_DIMENSION, normaliseBoardSize } from '../game/gameLogic'
import type { BoardSize, Difficulty, GameMode } from '../game/types'

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'The computer plays randomly' },
  { value: 'medium' as const, label: 'Medium', hint: 'The computer blocks and takes easy wins' },
  { value: 'hard' as const, label: 'Hard', hint: 'The computer plays optimally and never loses' },
]

const PRESET_SIZES = [3, 4, 5, 6, 7, 8]
const LARGEST_PRESET = PRESET_SIZES[PRESET_SIZES.length - 1]

const SIZE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  ...PRESET_SIZES.map((size) => ({ value: `${size}x${size}`, label: `${size}×${size}` })),
  { value: 'custom', label: 'More…', hint: 'Pick any rows and columns from 3 to 10' },
]

export interface GameControlsProps {
  mode: GameMode
  difficulty: Difficulty
  boardSize: BoardSize
  onDifficultyChange: (difficulty: Difficulty) => void
  onBoardSizeChange: (rows: number, cols: number) => void
  onRestart: () => void
  onNewMatch: () => void
  /** Replaces the local round controls (used by the online mode). */
  children?: ReactNode
}

export function GameControls({
  mode,
  difficulty,
  boardSize,
  onDifficultyChange,
  onBoardSizeChange,
  onRestart,
  onNewMatch,
  children,
}: GameControlsProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const { rows, cols, winLength } = boardSize

  const isPreset = rows === cols && rows >= MIN_DIMENSION && rows <= LARGEST_PRESET
  const selected = customOpen || !isPreset ? 'custom' : `${cols}x${cols}`

  const handleSizeChange = (value: string) => {
    if (value === 'custom') {
      setCustomOpen(true)
      return
    }
    setCustomOpen(false)
    const size = Number(value.split('x')[0])
    onBoardSizeChange(size, size)
  }

  return (
    <section className="panel p-4" aria-label="Game controls">
      {mode === 'pvc' ? (
        <SegmentedControl
          label="Computer difficulty"
          name="ai-difficulty"
          value={difficulty}
          options={DIFFICULTY_OPTIONS}
          onChange={onDifficultyChange}
        />
      ) : null}

      {mode !== 'online' ? (
        <div className="mt-4">
          <SegmentedControl
            label="Board size"
            name="board-size"
            value={selected}
            options={SIZE_OPTIONS}
            onChange={handleSizeChange}
            className="board-size-fieldset"
          />

          {selected === 'custom' ? (
            <div className="board-size-custom">
              <SizeStepper
                label="Rows"
                value={rows}
                onChange={(next) => onBoardSizeChange(next, cols)}
              />
              <span className="board-size-times" aria-hidden="true">
                ×
              </span>
              <SizeStepper
                label="Columns"
                value={cols}
                onChange={(next) => onBoardSizeChange(rows, next)}
              />
            </div>
          ) : null}

          <p className="board-size-badge">
            {rows}×{cols} • {winLength} to win
            {normaliseBoardSize(rows, cols) === null ? ' • Max 100 cells' : ''}
          </p>
        </div>
      ) : null}

      {children}

      {mode !== 'online' ? (
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button type="button" onClick={onRestart} className="btn btn-secondary w-full">
            <RotateCcw className="size-4" aria-hidden="true" />
            Restart round
          </button>
          <button type="button" onClick={onNewMatch} className="btn btn-primary w-full">
            <Trophy className="size-4" aria-hidden="true" />
            New match
          </button>
        </div>
      ) : null}

      <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-muted">
        <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {mode === 'pvc'
            ? 'Hard difficulty uses minimax search and can never lose against an optimal opponent.'
            : mode === 'pvp'
              ? 'Two players share this device. X always starts a new round.'
              : 'Online matches are hosted by the database. Every move is validated on the server.'}
        </span>
      </p>
    </section>
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
