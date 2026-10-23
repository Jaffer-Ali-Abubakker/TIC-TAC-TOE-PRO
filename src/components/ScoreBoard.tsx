import { Bot, Crown, Medal, User } from 'lucide-react'
import type { GameMode, GameStatus, Player, Stats } from '../game/types'

export interface ScoreBoardProps {
  mode: GameMode
  stats: Stats
  humanSymbol: Player
  currentPlayer: Player
  status: GameStatus
  roundNumber: number
  completedRounds: number
}

interface Tile {
  key: string
  label: string
  symbol: Player
  value: number
  icon: typeof Crown
  accent: string
}

export function ScoreBoard({
  mode,
  stats,
  humanSymbol,
  currentPlayer,
  status,
  roundNumber,
  completedRounds,
}: ScoreBoardProps) {
  const tiles: Tile[] =
    mode === 'pvc'
      ? [
          {
            key: 'player',
            label: 'You',
            symbol: humanSymbol,
            value: stats.pvc.playerWins,
            icon: User,
            accent: 'text-glow-cyan',
          },
          {
            key: 'draw',
            label: 'Draws',
            symbol: 'X',
            value: stats.pvc.draws,
            icon: Medal,
            accent: 'text-mist-500',
          },
          {
            key: 'computer',
            label: 'Computer',
            symbol: humanSymbol === 'X' ? 'O' : 'X',
            value: stats.pvc.computerWins,
            icon: Bot,
            accent: 'text-glow-violet',
          },
        ]
      : mode === 'online'
        ? [
            {
              key: 'x',
              label: 'Player 1 (X)',
              symbol: 'X',
              value: stats.online.xWins,
              icon: Crown,
              accent: 'text-glow-cyan',
            },
            {
              key: 'draw',
              label: 'Draws',
              symbol: 'X',
              value: stats.online.draws,
              icon: Medal,
              accent: 'text-mist-500',
            },
            {
              key: 'o',
              label: 'Player 2 (O)',
              symbol: 'O',
              value: stats.online.oWins,
              icon: User,
              accent: 'text-glow-violet',
            },
          ]
        : [
          {
            key: 'x',
            label: 'Player 1',
            symbol: 'X',
            value: stats.pvp.xWins,
            icon: Crown,
            accent: 'text-glow-cyan',
          },
          {
            key: 'draw',
            label: 'Draws',
            symbol: 'X',
            value: stats.pvp.draws,
            icon: Medal,
            accent: 'text-mist-500',
          },
          {
            key: 'o',
            label: 'Player 2',
            symbol: 'O',
            value: stats.pvp.oWins,
            icon: User,
            accent: 'text-glow-violet',
          },
        ]

  const isActive = (tile: Tile) =>
    status === 'playing' && tile.key !== 'draw' && tile.symbol === currentPlayer

  return (
    <section className="panel p-3" aria-label="Current match score">
      <div className="flex items-center justify-between gap-3">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const active = isActive(tile)
          return (
            <div
              key={tile.key}
              data-testid={`score-${tile.key}`}
              data-active={active}
              data-accent={tile.symbol === 'O' ? 'violet' : 'cyan'}
              className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 ${
                active
                  ? tile.symbol === 'O'
                    ? 'border-glow-violet bg-glow-violet/10'
                    : 'border-glow-cyan bg-glow-cyan/10'
                  : 'border-ink-700 bg-white'
              }`}
            >
              <Icon className={`size-4 ${tile.accent}`} aria-hidden="true" />
              <span className="text-sm font-semibold text-ink-700">{tile.value}</span>
              <span className="text-[11px] uppercase tracking-wider text-mist-500">
                {tile.label}
              </span>
            </div>
          )
        })}
        <span className="text-[12px] text-mist-500">
          Round <span className="font-semibold text-ink-700">{roundNumber}</span>
          {completedRounds > 0 ? ` · ${completedRounds} completed` : null}
        </span>
      </div>
    </section>
  )
}
