import type { ReactNode } from 'react'
import { Gauge, RotateCcw, Trophy } from 'lucide-react'
import { BoardSizePicker } from './BoardSizePicker'
import { SegmentedControl } from './SegmentedControl'
import type { BoardSize, Difficulty, GameMode } from '../game/types'

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'Plays random legal moves' },
  { value: 'medium' as const, label: 'Medium', hint: 'Blocks wins, prefers the centre' },
  { value: 'hard' as const, label: 'Hard', hint: 'Optimal play - never loses on 3x3' },
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
  const activeHint = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty)?.hint ?? ''

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
          <BoardSizePicker boardSize={boardSize} onChange={onBoardSizeChange} />
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
