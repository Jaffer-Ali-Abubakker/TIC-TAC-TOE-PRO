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
  ring: string
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
          accent: 'text-glow-emerald',
          ring: 'border-2 border-glow-emerald',
          result: 'win',
        }
      : {
          title: 'Opponent wins',
          detail: 'Your opponent completed the line and took the round.',
          icon: Crown,
          accent: 'text-glow-rose',
          ring: 'border-2 border-glow-rose',
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
            accent: 'text-glow-emerald',
            ring: 'border-2 border-glow-emerald',
            result: 'win',
          }
        : {
            title: 'Computer wins',
            detail: 'The computer took this round. Try another difficulty?',
            icon: Crown,
            accent: 'text-glow-rose',
            ring: 'border-2 border-glow-rose',
            result: 'loss',
          }
    } else {
      info =
        winner === 'X'
          ? {
              title: 'Player 1 wins',
              detail: 'Player 1 completed a line with X.',
              icon: Crown,
              accent: 'text-glow-cyan',
              ring: 'border-2 border-glow-cyan',
              result: 'win',
            }
          : {
              title: 'Player 2 wins',
              detail: 'Player 2 completed a line with O.',
              icon: Handshake,
              accent: 'text-glow-violet',
              ring: 'border-2 border-glow-violet',
              result: 'win',
            }
    }
  } else if (status === 'draw') {
    info = {
      title: 'Draw',
      detail: 'The board is full and nobody has a line.',
      icon: Medal,
      accent: 'text-glow-amber',
      ring: 'border-2 border-glow-amber',
      result: 'draw',
    }
  } else if (endedWithoutWinner) {
    info = {
      title: 'Match ended',
      detail: 'The match was ended without a winner. No forfeit win is awarded.',
      icon: Handshake,
      accent: 'text-mist-500',
      ring: 'border-2 border-ink-700',
      result: 'neutral',
    }
  } else {
    info = {
      title: `Round ${roundNumber}`,
      detail: 'X starts every new round.',
      icon: User,
      accent: 'text-mist-500',
      ring: 'border-2 border-ink-700',
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
      className={`result-banner flex min-h-[4.5rem] items-center gap-3 rounded-xl border px-4 py-3 ${info.ring} ${
        status === 'playing' ? '' : 'animate-result-in'
      }`}
    >
      <Icon className={`size-5 shrink-0 ${info.accent}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-700">{info.title}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-mist-500">{info.detail}</p>
      </div>
    </div>
  )
}
