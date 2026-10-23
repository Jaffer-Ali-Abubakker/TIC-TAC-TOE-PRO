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
      className="grid size-10 shrink-0 grid-cols-3 gap-[2px] rounded-sm border border-ink-700 bg-white p-[3px]"
    >
      {board.map((cell, index) => (
        <span
          key={index}
          className={`rounded-sm ${
            cell === 'X'
              ? 'bg-glow-cyan'
              : cell === 'O'
                ? 'bg-glow-violet'
                : 'bg-ink-100'
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
    <section className="panel p-4" aria-label="Match history">
      <div className="mb-4 flex items-center gap-3">
        <Clock className="size-5 text-ink-700" aria-hidden="true" />
        <h2 className="micro-label">Recent rounds</h2>
        <span className="ml-auto text-[13px] tabular-nums text-mist-500">{history.length} / 20</span>
      </div>

      {history.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-ink-700 bg-white px-4 py-3 text-center">
          <Trophy className="mx-auto size-5 text-mist-500" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-ink-700">No completed rounds yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-mist-500">
            Finished rounds will be listed here with their final board.
          </p>
        </div>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-0.5">
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
                className="flex items-center gap-3 rounded-xl border-2 border-ink-700 bg-white px-3 py-2"
              >
                <MiniBoard board={entry.board} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink-700">
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
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                    entry.mode === mode
                      ? 'bg-glow-cyan text-white'
                      : 'bg-ink-100 text-mist-500'
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
