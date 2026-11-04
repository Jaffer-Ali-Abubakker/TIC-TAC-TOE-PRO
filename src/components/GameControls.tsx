import { useState, type ReactNode } from 'react'
import { Gauge, RotateCcw, Trophy } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import { MAX_DIMENSION, MIN_DIMENSION, normaliseBoardSize } from '../game/gameLogic'
import type { BoardSize, Difficulty, GameMode } from '../game/types'

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'Plays random legal moves' },
  { value: 'medium' as const, label: 'Medium', hint: 'Blocks wins, prefers the centre' },
  { value: 'hard' as const, label: 'Hard', hint: 'Optimal play - never loses on 3x3' },
]

const PRESET_SIZES = [3, 4, 5, 6, 7, 8]
const LARGEST_PRESET = PRESET_SIZES[PRESET_SIZES.length - 1]

const SIZE_OPTIONS: { value: string; label: string; hint?: string }[] = [
  ...PRESET_SIZES.map((size) => ({ value: `${size}x${size}`, label: `${size}×${size}` })),
  { value: 'custom', label: 'More…', hint: 'Pick any rows and columns from 3 to 10' },
]

export interface SettingsCardsProps {
  mode: GameMode
  difficulty: Difficulty
  boardSize: BoardSize
  onDifficultyChange: (difficulty: Difficulty) => void
  onBoardSizeChange: (rows: number, cols: number) => void
}

/**
 * The two settings groups. They share one card on a phone (the container does
 * it in CSS) and become separate cards in the desktop side rail.
 */
export function SettingsCards({
  mode,
  difficulty,
  boardSize,
  onDifficultyChange,
  onBoardSizeChange,
}: SettingsCardsProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const { rows, cols, winLength } = boardSize

  const isPreset = rows === cols && rows >= MIN_DIMENSION && rows <= LARGEST_PRESET
  const selected = customOpen || !isPreset ? 'custom' : `${cols}x${cols}`
  const activeHint = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.hint ?? ''

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
    <div className="settings-group">
      {mode === 'pvc' ? (
        <section className="settings-card" aria-label="Computer difficulty">
          <SegmentedControl
            label="Computer difficulty"
            name="ai-difficulty"
            value={difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={onDifficultyChange}
            className="scroll-tabs"
          />
          <p className="settings-hint">{activeHint}</p>
        </section>
      ) : null}

      {mode !== 'online' ? (
        <section className="settings-card" aria-label="Board size">
          <SegmentedControl
            label="Board size"
            name="board-size"
            value={selected}
            options={SIZE_OPTIONS}
            onChange={handleSizeChange}
            className="board-size-fieldset scroll-tabs"
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
        </section>
      ) : null}

      <p className="rail-note">
        <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          {mode === 'pvc'
            ? 'Hard difficulty uses minimax search and can never lose against an optimal opponent.'
            : mode === 'pvp'
              ? 'Two players share this device. X always starts a new round.'
              : 'Online matches are hosted by the database. Every move is validated on the server.'}
        </span>
      </p>
    </div>
  )
}

export interface RoundControlsProps {
  mode: GameMode
  onRestart: () => void
  onNewMatch: () => void
  /** Replaces the local round controls (used by the online mode). */
  children?: ReactNode
}

/** Restart / new match, or the online room actions. */
export function RoundControls({ mode, onRestart, onNewMatch, children }: RoundControlsProps) {
  return (
    <div className="stage-actions">
      {children}

      {mode !== 'online' ? (
        <div className="grid grid-cols-2 gap-2">
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
    </div>
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
