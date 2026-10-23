import { Bot, Globe, Grid3x3, Settings, Users, Volume2, VolumeX } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import type { GameMode } from '../game/types'

export interface GameHeaderProps {
  mode: GameMode
  soundEnabled: boolean
  onToggleSound: () => void
  onOpenSettings: () => void
  onModeChange: (mode: GameMode) => void
}

const MODE_LABEL: Record<GameMode, string> = {
  pvc: 'Player vs Computer',
  pvp: 'Two Players',
  online: 'Online Multiplayer',
}

const HEADER_MODE_OPTIONS = [
  { value: 'pvc' as const, label: 'vs Computer', icon: <Bot className="size-3" aria-hidden="true" /> },
  { value: 'pvp' as const, label: '2 Players', icon: <Users className="size-3" aria-hidden="true" /> },
  {
    value: 'online' as const,
    label: 'Online',
    icon: <Globe className="size-3" aria-hidden="true" /> },
]

/** Application header: brand, current mode indicator and quick actions. */
export function GameHeader({
  mode,
  soundEnabled,
  onToggleSound,
  onOpenSettings,
  onModeChange,
}: GameHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <span className="brand-mark flex size-9 shrink-0 items-center justify-center rounded-sm text-ink-700">
          <Grid3x3 className="size-4" strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold tracking-tight text-ink-700 sm:text-xl">
            Tic-Tac-Toe{' '}
            <span className="text-glow-cyan">Pro</span>
          </h1>
          <p className="micro-label mt-0.5 flex items-center gap-1.5">
            <span className="inline-block size-1.5 rounded-full bg-ink-700" aria-hidden="true" />
            {MODE_LABEL[mode]}
          </p>
        </div>
      </div>

      <div className="flex-1 max-w-sm mx-4">
        <SegmentedControl
          label="Game mode"
          name="game-mode"
          value={mode}
          options={HEADER_MODE_OPTIONS}
          onChange={onModeChange}
          showLabel={false}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className="inline-flex size-10 items-center justify-center rounded-sm border border-ink-700 bg-white text-ink-700 transition-colors duration-150 hover:bg-ink-600 hover:text-white"
        >
          {soundEnabled ? (
            <Volume2 className="size-4" aria-hidden="true" />
          ) : (
            <VolumeX className="size-4" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="inline-flex size-10 items-center justify-center rounded-sm border border-ink-700 bg-white text-ink-700 transition-colors duration-150 hover:bg-ink-600 hover:text-white"
        >
          <Settings className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
