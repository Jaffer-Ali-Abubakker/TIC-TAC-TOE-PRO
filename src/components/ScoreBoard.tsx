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

  return (
    <section className="panel p-4" aria-label="Current match score">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const isActive =
            status === 'playing' && tile.key !== 'draw' && tile.symbol === currentPlayer
          return (
            <div
              key={tile.key}
              data-testid={`score-${tile.key}`}
              data-active={isActive}
              data-accent={tile.symbol === 'O' ? 'violet' : 'cyan'}
              className="score-card px-3 py-4 text-center"
            >
              <Icon className={`mx-auto size-5 ${tile.accent}`} aria-hidden="true" />
              <p className="mt-2 text-3xl font-bold tabular-nums text-ink-700">
                {tile.value}
              </p>
              <p className="mt-1 truncate text-[12px] font-medium text-mist-500 uppercase tracking-wider">
                {tile.label}
              </p>
            </div>
          )
        })}
      </div>

      <p className="mt-4 flex items-center justify-between text-[13px] tabular-nums text-mist-500">
        <span>
          Round <span className="font-semibold text-ink-700">{roundNumber}</span>
        </span>
        <span>
          {completedRounds} completed {completedRounds === 1 ? 'round' : 'rounds'}
        </span>
      </p>
    </section>
  )
}
