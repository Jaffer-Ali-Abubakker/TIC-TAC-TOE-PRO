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
  symbol: Player | null
  value: number
  icon: typeof Crown
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
  const computerSymbol: Player = humanSymbol === 'X' ? 'O' : 'X'

  const tiles: Tile[] =
    mode === 'pvc'
      ? [
          { key: 'player', label: 'You', symbol: humanSymbol, value: stats.pvc.playerWins, icon: User },
          { key: 'draw', label: 'Draws', symbol: null, value: stats.pvc.draws, icon: Medal },
          { key: 'computer', label: 'Computer', symbol: computerSymbol, value: stats.pvc.computerWins, icon: Bot },
        ]
      : mode === 'online'
        ? [
            { key: 'x', label: 'Player 1 (X)', symbol: 'X', value: stats.online.xWins, icon: Crown },
            { key: 'draw', label: 'Draws', symbol: null, value: stats.online.draws, icon: Medal },
            { key: 'o', label: 'Player 2 (O)', symbol: 'O', value: stats.online.oWins, icon: User },
          ]
        : [
            { key: 'x', label: 'Player 1 (X)', symbol: 'X', value: stats.pvp.xWins, icon: Crown },
            { key: 'draw', label: 'Draws', symbol: null, value: stats.pvp.draws, icon: Medal },
            { key: 'o', label: 'Player 2 (O)', symbol: 'O', value: stats.pvp.oWins, icon: User },
          ]

  return (
    <section aria-label="Current match score">
      <div className="score-board">
        {tiles.map((tile) => {
          const Icon = tile.icon
          const active = status === 'playing' && tile.symbol === currentPlayer
          return (
            <div
              key={tile.key}
              data-testid={`score-${tile.key}`}
              data-active={active}
              data-player={tile.symbol ?? undefined}
              className="score-pill"
            >
              <Icon
                className={`size-4 ${
                  tile.symbol === 'X'
                    ? 'text-lime'
                    : tile.symbol === 'O'
                      ? 'text-cyan'
                      : 'text-muted'
                }`}
                aria-hidden="true"
              />
              <span className="score-number">{tile.value}</span>
              <span className="score-label">{tile.label}</span>
            </div>
          )
        })}
      </div>

      <p className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-widest text-muted">
        <span>Round {roundNumber}</span>
        <span>
          {completedRounds} {completedRounds === 1 ? 'round' : 'rounds'} played
        </span>
      </p>
    </section>
  )
}
