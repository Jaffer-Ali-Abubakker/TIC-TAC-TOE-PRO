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
      className="grid size-10 shrink-0 grid-cols-3 gap-[2px] rounded-sm border border-border bg-card p-[3px]"
    >
      {board.map((cell, index) => (
        <span
          key={index}
          className={`rounded-sm ${
            cell === 'X'
              ? 'bg-lime'
              : cell === 'O'
                ? 'bg-cyan'
                : 'bg-white/10'
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
        <Clock className="size-5 text-text" aria-hidden="true" />
        <h2 className="micro-label">Recent rounds</h2>
        <span className="ml-auto text-[13px] tabular-nums text-muted">{history.length} / 20</span>
      </div>

      {history.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-border bg-card px-4 py-3 text-center">
          <Trophy className="mx-auto size-5 text-muted" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-text">No completed rounds yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
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
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2"
              >
                <MiniBoard board={entry.board} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text">
                    Round {entry.round} - {resultLabel}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-muted">
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
                      ? 'bg-lime text-void'
                      : 'bg-border text-muted'
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