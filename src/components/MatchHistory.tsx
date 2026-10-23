import { Clock, Trophy } from 'lucide-react'
import type { Cell, GameMode, HistoryEntry } from '../game/types'

export interface MatchHistoryProps {
  history: HistoryEntry[]
  mode: GameMode
}

function MiniBoard({ board }: { board: Cell[] }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-9 shrink-0 grid-cols-3 gap-[2px] rounded-md border border-ink-700 bg-ink-950/70 p-[3px]"
    >
      {board.map((cell, index) => (
        <span
          key={index}
          className={`rounded-[2px] ${
            cell === 'X'
              ? 'bg-glow-cyan/80'
              : cell === 'O'
                ? 'bg-glow-violet/80'
                : 'bg-ink-700/50'
          }`}
        />
      ))}
    </span>
  )
}

function formatTime(timestamp: number): string {
  if (!timestamp) return ''
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MatchHistory({ history, mode }: MatchHistoryProps) {
  return (
    <section className="panel p-3" aria-label="Match history">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="size-4 text-glow-violet" aria-hidden="true" />
        <h2 className="micro-label">Recent rounds</h2>
        <span className="ml-auto text-[12px] tabular-nums text-mist-500">{history.length} / 20</span>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-700 bg-ink-900/40 px-4 py-4 text-center">
          <Trophy className="mx-auto size-5 text-mist-500" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-mist-300">No completed rounds yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist-500">
            Finished rounds will be listed here with their final board.
          </p>
        </div>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
          {history.map((entry) => {
            const isDraw = entry.result === 'draw'
            const resultLabel = isDraw
              ? 'Draw'
              : entry.result === 'X'
                ? 'X wins'
                : 'O wins'
            return (
              <li
                key={entry.id}
                data-testid="history-entry"
                className="flex items-center gap-3 rounded-xl border border-ink-700/70 bg-ink-900/50 px-2 py-2"
              >
                <MiniBoard board={entry.board} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-mist-200">
                    Round {entry.round} - {resultLabel}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-mist-500">
                    {entry.winnerLabel}
                    {entry.mode === 'pvp'
                      ? ' (two players)'
                      : entry.mode === 'online'
                        ? ' (online)'
                        : ' (vs computer)'}{' '}
                    - {formatTime(entry.timestamp)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide ${
                    entry.mode === mode
                      ? 'bg-glow-cyan/15 text-glow-cyan'
                      : 'bg-ink-750 text-mist-500'
                  }`}
                >
                  {entry.mode === 'pvp' ? '2P' : entry.mode === 'online' ? 'ON' : 'AI'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
