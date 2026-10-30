import { Crown, Handshake, Medal, Sparkles, User } from 'lucide-react'
import type { GameMode, GameStatus, Player } from '../game/types'

export interface GameResultProps {
  status: GameStatus
  winner: Player | null
  mode: GameMode
  humanSymbol: Player
  roundNumber: number
  /** The symbol this browser plays in `online` mode. */
  mySymbol?: Player | null
  /** `true` when an online match ended without a winner (opponent left). */
  endedWithoutWinner?: boolean
}

interface ResultInfo {
  title: string
  detail: string
  icon: typeof Crown
  accent: string
  /** Drives the outcome border. */
  result: 'win' | 'draw' | 'loss' | 'neutral'
}

export function GameResult({
  status,
  winner,
  mode,
  humanSymbol,
  roundNumber,
  mySymbol = null,
  endedWithoutWinner = false,
}: GameResultProps) {
  let info: ResultInfo

  if (status === 'won' && winner !== null && mode === 'online') {
    const iWon = mySymbol !== null && winner === mySymbol
    info = iWon
      ? {
          title: 'You win!',
          detail: 'You completed the line and took the round.',
          icon: Sparkles,
          accent: 'text-lime',
          result: 'win',
        }
      : {
          title: 'Opponent wins',
          detail: 'Your opponent completed the line and took the round.',
          icon: Crown,
          accent: 'text-rose',
          result: 'loss',
        }
  } else if (status === 'won' && winner !== null) {
    if (mode === 'pvc') {
      const humanWon = winner === humanSymbol
      info = humanWon
        ? {
            title: 'You win!',
            detail: 'Great play - the computer could not keep up.',
            icon: Sparkles,
            accent: 'text-lime',
            result: 'win',
          }
        : {
            title: 'Computer wins',
            detail: 'The computer took this round. Try another difficulty?',
            icon: Crown,
            accent: 'text-rose',
            result: 'loss',
          }
    } else {
      info =
        winner === 'X'
          ? {
              title: 'Player 1 wins',
              detail: 'Player 1 completed a line with X.',
              icon: Crown,
              accent: 'text-lime',
              result: 'win',
            }
          : {
              title: 'Player 2 wins',
              detail: 'Player 2 completed a line with O.',
              icon: Handshake,
              accent: 'text-cyan',
              result: 'win',
            }
    }
  } else if (status === 'draw') {
    info = {
      title: 'Draw',
      detail: 'The board is full and nobody has a line.',
      icon: Medal,
      accent: 'text-amber',
      result: 'draw',
    }
  } else if (endedWithoutWinner) {
    info = {
      title: 'Match ended',
      detail: 'The match was ended without a winner. No forfeit win is awarded.',
      icon: Handshake,
      accent: 'text-muted',
      result: 'neutral',
    }
  } else {
    info = {
      title: `Round ${roundNumber}`,
      detail: 'X starts every new round.',
      icon: User,
      accent: 'text-muted',
      result: 'neutral',
    }
  }

  const Icon = info.icon

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="game-result"
      data-result={info.result}
      className={`result-banner ${status === 'playing' ? '' : 'animate-result-in'}`}
    >
      <Icon className={`size-5 shrink-0 ${info.accent}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="result-title">{info.title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{info.detail}</p>
      </div>
    </div>
  )
}
