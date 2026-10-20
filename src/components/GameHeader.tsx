import { Grid3x3, Settings, Volume2, VolumeX } from 'lucide-react'
import type { GameMode } from '../game/types'

export interface GameHeaderProps {
  mode: GameMode
  soundEnabled: boolean
  onToggleSound: () => void
  onOpenSettings: () => void
}

const MODE_LABEL: Record<GameMode, string> = {
  pvc: 'Player vs Computer',
  pvp: 'Two Players',
  online: 'Online Multiplayer',
}

/** Application header: brand, current mode indicator and quick actions. */
export function GameHeader({ mode, soundEnabled, onToggleSound, onOpenSettings }: GameHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="brand-mark flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-950">
          <Grid3x3 className="size-5" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight text-mist-100 sm:text-xl">
            Tic-Tac-Toe <span className="text-glow-cyan">Pro</span>
          </h1>
          <p className="flex items-center gap-1.5 text-xs text-mist-500">
            <span className="inline-block size-1.5 rounded-full bg-glow-cyan" aria-hidden="true" />
            {MODE_LABEL[mode]}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className="inline-flex size-10 items-center justify-center rounded-xl border border-ink-700 bg-ink-850/80 text-mist-300 transition-colors hover:border-ink-600 hover:text-mist-100"
        >
          {soundEnabled ? (
            <Volume2 className="size-4.5" aria-hidden="true" />
          ) : (
            <VolumeX className="size-4.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-ink-700 bg-ink-850/80 text-mist-300 transition-colors hover:border-ink-600 hover:text-mist-100"
        >
          <Settings className="size-4.5" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
