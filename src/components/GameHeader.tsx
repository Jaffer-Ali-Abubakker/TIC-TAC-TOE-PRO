import { Bot, Globe, Settings, Users, Volume2, VolumeX } from 'lucide-react'
import { SegmentedControl } from './SegmentedControl'
import type { GameMode } from '../game/types'

export interface GameHeaderProps {
  mode: GameMode
  soundEnabled: boolean
  onToggleSound: () => void
  onOpenSettings: () => void
  onModeChange: (mode: GameMode) => void
}

const HEADER_MODE_OPTIONS = [
  { value: 'pvc' as const, label: 'vs Computer', icon: <Bot className="size-3" aria-hidden="true" /> },
  { value: 'pvp' as const, label: '2 Players', icon: <Users className="size-3" aria-hidden="true" /> },
  { value: 'online' as const, label: 'Online', icon: <Globe className="size-3" aria-hidden="true" /> },
]

/** Application header: brand, mode switcher and quick actions. */
export function GameHeader({
  mode,
  soundEnabled,
  onToggleSound,
  onOpenSettings,
  onModeChange,
}: GameHeaderProps) {
  return (
    <header className="header">
      <h1 className="header-brand">
        Tic-Tac-Toe <span className="header-brand-accent">Pro</span>
      </h1>

      <div className="mode-switcher min-w-0">
        <SegmentedControl
          label="Game mode"
          name="game-mode"
          value={mode}
          options={HEADER_MODE_OPTIONS}
          onChange={onModeChange}
          showLabel={false}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          aria-pressed={soundEnabled}
          aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
          title={soundEnabled ? 'Sound on' : 'Sound off'}
          className="btn btn-secondary btn-icon"
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
          className="btn btn-secondary btn-icon"
        >
          <Settings className="size-4" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
