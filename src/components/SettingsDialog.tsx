import { Circle, Trash, TriangleAlert, X } from 'lucide-react'
import { Dialog } from './Dialog'
import { SegmentedControl } from './SegmentedControl'
import { Toggle } from './Toggle'
import type { Difficulty, GameMode, Player } from '../game/types'

export interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  mode: GameMode
  difficulty: Difficulty
  humanSymbol: Player
  soundEnabled: boolean
  storageAvailable: boolean
  onSoundChange: (enabled: boolean) => void
  onDifficultyChange: (difficulty: Difficulty) => void
  onHumanSymbolChange: (symbol: Player) => void
  onResetStats: () => void
}

const DIFFICULTY_OPTIONS = [
  { value: 'easy' as const, label: 'Easy', hint: 'Random legal moves' },
  { value: 'medium' as const, label: 'Medium', hint: 'Wins and blocks' },
  { value: 'hard' as const, label: 'Hard', hint: 'Optimal minimax play' },
]

export function SettingsDialog({
  open,
  onClose,
  mode,
  difficulty,
  humanSymbol,
  soundEnabled,
  storageAvailable,
  onSoundChange,
  onDifficultyChange,
  onHumanSymbolChange,
  onResetStats,
}: SettingsDialogProps) {
  const isComputerMode = mode === 'pvc'

  return (
    <Dialog
      open={open}
      title="Settings"
      description="Preferences are stored locally on this device."
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="panel-inset p-3">
          <Toggle
            label="Sound effects"
            description="Short tones for moves, wins and draws. Generated on the fly, no downloads."
            checked={soundEnabled}
            onChange={onSoundChange}
          />
        </div>

        {isComputerMode ? (
          <>
            <div className="panel-inset p-3">
              <SegmentedControl
                label="Your symbol"
                name="settings-human-symbol"
                value={humanSymbol}
                onChange={onHumanSymbolChange}
                options={[
                  {
                    value: 'X' as const,
                    label: 'X',
                    icon: <X className="size-4 text-lime" aria-hidden="true" />,
                  },
                  {
                    value: 'O' as const,
                    label: 'O',
                    icon: <Circle className="size-4 text-cyan" aria-hidden="true" />,
                  },
                ]}
              />
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Changing your symbol starts a fresh round.
              </p>
            </div>

            <div className="panel-inset p-3">
              <SegmentedControl
                label="Computer difficulty"
                name="settings-difficulty"
                value={difficulty}
                onChange={onDifficultyChange}
                options={DIFFICULTY_OPTIONS}
              />
            </div>
          </>
        ) : (
          <p className="panel-inset p-3 text-[13px] leading-relaxed text-muted">
            Symbol and difficulty settings only apply to the player versus computer mode. Switch
            back to that mode to change them.
          </p>
        )}

        <div className="panel-inset p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text">Reset statistics</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted">
                Clears all scores and the round history for both modes.
              </p>
            </div>
            <button
              type="button"
              onClick={onResetStats}
              className="btn btn-secondary"
            >
              <Trash className="size-4" aria-hidden="true" />
              Reset
            </button>
          </div>
        </div>

        {!storageAvailable ? (
          <p className="flex items-start gap-2 rounded-lg border border-amber bg-amber/20 p-3 text-[13px] leading-relaxed text-amber">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Local storage is unavailable in this browser, so settings and scores will not be kept
              after a reload.
            </span>
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}