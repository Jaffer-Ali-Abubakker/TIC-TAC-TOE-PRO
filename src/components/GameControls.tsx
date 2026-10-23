import type { ReactNode } from 'react'
import { Bot, Gauge, Globe, RotateCcw, Trophy, Users } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import type { Difficulty, GameMode } from '../game/types'

export interface GameControlsProps {
  mode: GameMode
  difficulty: Difficulty
  onModeChange: (mode: GameMode) => void
  onDifficultyChange: (difficulty: Difficulty) => void
  onRestart: () => void
  onNewMatch: () => void
  /** Replaces the local round controls (used by the online mode). */
  children?: ReactNode
}

const MODE_OPTIONS = [
  { value: 'pvc' as const, label: 'vs Computer', icon: <Bot className="size-4" aria-hidden="true" /> },
  { value: 'pvp' as const, label: '2 Players', icon: <Users className="size-4" aria-hidden="true" /> },
  {
    value: 'online' as const,
    label: 'Online',
    icon: <Globe className="size-4" aria-hidden="true" />,
  },
]

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'The computer plays randomly' },
  { value: 'medium' as const, label: 'Medium', hint: 'The computer blocks and takes easy wins' },
  { value: 'hard' as const, label: 'Hard', hint: 'The computer plays optimally and never loses' },
]

export function GameControls({
  mode,
  difficulty,
  onModeChange,
  onDifficultyChange,
  onRestart,
  onNewMatch,
  children,
}: GameControlsProps) {
  return (
    <section className="panel p-4" aria-label="Game controls">
      <SegmentedControl
        label="Game mode"
        name="game-mode"
        value={mode}
        options={MODE_OPTIONS}
        onChange={onModeChange}
      />

      {children}

      {mode === 'pvc' ? (
        <div className="mt-4">
          <SegmentedControl
            label="Computer difficulty"
            name="ai-difficulty"
            value={difficulty}
            options={DIFFICULTY_OPTIONS}
            onChange={onDifficultyChange}
          />
        </div>
      ) : null}

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

      <p className="mt-4 flex items-start gap-2 text-[12px] leading-relaxed text-mist-500">
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
