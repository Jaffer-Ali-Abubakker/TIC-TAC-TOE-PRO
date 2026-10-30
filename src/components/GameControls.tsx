import type { ReactNode } from 'react'
import { Gauge, RotateCcw, Trophy } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import type { Difficulty, GameMode } from '../game/types'

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'The computer plays randomly' },
  { value: 'medium' as const, label: 'Medium', hint: 'The computer blocks and takes easy wins' },
  { value: 'hard' as const, label: 'Hard', hint: 'The computer plays optimally and never loses' },
]

export interface GameControlsProps {
  mode: GameMode
  difficulty: Difficulty
  onDifficultyChange: (difficulty: Difficulty) => void
  onRestart: () => void
  onNewMatch: () => void
  /** Replaces the local round controls (used by the online mode). */
  children?: ReactNode
}

export function GameControls({
  mode,
  difficulty,
  onDifficultyChange,
  onRestart,
  onNewMatch,
  children,
}: GameControlsProps) {
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
