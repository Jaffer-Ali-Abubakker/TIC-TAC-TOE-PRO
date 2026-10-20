import { Bot, ChartColumn, Globe, Handshake, Medal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GameMode, Stats } from '../game/types'

export interface MatchStatsProps {
  mode: GameMode
  stats: Stats
}

interface StatRow {
  id: string
  title: string
  icon: LucideIcon
  entries: { label: string; value: number }[]
  rounds: number
}

export function MatchStats({ mode, stats }: MatchStatsProps) {
  const rows: StatRow[] = [
    {
      id: 'pvc',
      title: 'Player vs Computer',
      icon: Bot,
      entries: [
        { label: 'You', value: stats.pvc.playerWins },
        { label: 'Computer', value: stats.pvc.computerWins },
        { label: 'Draws', value: stats.pvc.draws },
      ],
      rounds: stats.pvc.rounds,
    },
    {
      id: 'pvp',
      title: 'Two Players',
      icon: Handshake,
      entries: [
        { label: 'Player 1', value: stats.pvp.xWins },
        { label: 'Player 2', value: stats.pvp.oWins },
        { label: 'Draws', value: stats.pvp.draws },
      ],
      rounds: stats.pvp.rounds,
    },
    {
      id: 'online',
      title: 'Online Multiplayer',
      icon: Globe,
      entries: [
        { label: 'Player 1', value: stats.online.xWins },
        { label: 'Player 2', value: stats.online.oWins },
        { label: 'Draws', value: stats.online.draws },
      ],
      rounds: stats.online.rounds,
    },
  ]

  return (
    <section className="panel p-4" aria-label="Match statistics">
      <div className="mb-3 flex items-center gap-2">
        <ChartColumn className="size-4 text-glow-cyan" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-tight text-mist-100">Match statistics</h2>
      </div>

      <ul className="space-y-2">
        {rows.map((row) => {
          const Icon = row.icon
          const isActive = row.id === mode
          return (
            <li
              key={row.id}
              data-testid={`stats-${row.id}`}
              className={`rounded-xl border px-3 py-2.5 transition-colors duration-150 ${
                isActive ? 'border-glow-cyan/40 bg-glow-cyan/5' : 'border-ink-700/70 bg-ink-900/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-mist-200">
                  <Icon className="size-3.5 text-mist-500" aria-hidden="true" />
                  {row.title}
                </span>
                <span className="text-[11px] tabular-nums text-mist-500">
                  {row.rounds} {row.rounds === 1 ? 'round' : 'rounds'}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-3 gap-2">
                {row.entries.map((entry) => (
                  <div key={entry.label}>
                    <dt className="truncate text-[10px] uppercase tracking-wider text-mist-500">
                      {entry.label}
                    </dt>
                    <dd className="text-sm font-semibold tabular-nums text-mist-100">
                      {entry.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </li>
          )
        })}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-mist-500">
        <Medal className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
        <span>
          Wins, draws and completed rounds are tracked separately for each mode, so switching modes
          never mixes the records.
        </span>
      </p>
    </section>
  )
}
