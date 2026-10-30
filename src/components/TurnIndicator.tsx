import { Bot, User, Users } from 'lucide-react'
import type { GameMode, Player } from '../game/types'

export interface TurnIndicatorProps {
  mode: GameMode
  currentPlayer: Player
  humanSymbol: Player
  isThinking: boolean
  /** The symbol this browser plays in `online` mode. */
  mySymbol?: Player | null
  /** `true` while the online room waits for a second player. */
  waitingForOpponent?: boolean
}

interface TurnInfo {
  label: string
  hint: string
  icon: typeof User
  accent: string
  /** Drives the banner border. Mirrors the accent, never the logic. */
  accentKey: 'cyan' | 'violet' | 'neutral'
}

export function TurnIndicator({
  mode,
  currentPlayer,
  humanSymbol,
  isThinking,
  mySymbol = null,
  waitingForOpponent = false,
}: TurnIndicatorProps) {
  let info: TurnInfo

  if (mode === 'online') {
    if (waitingForOpponent) {
      info = {
        label: 'Waiting for an opponent',
        hint: 'Share the room code to start the match',
        icon: User,
        accent: 'text-muted',
        accentKey: 'neutral',
      }
    } else if (mySymbol !== null && currentPlayer === mySymbol) {
      info = {
        label: 'Your turn',
        hint: 'Place your symbol',
        icon: User,
        accent: 'text-lime',
        accentKey: 'cyan',
      }
    } else {
      info = {
        label: "Opponent's turn",
        hint: 'Waiting for your opponent to move',
        icon: Bot,
        accent: 'text-cyan',
        accentKey: 'violet',
      }
    }
  } else if (mode === 'pvp') {
    info =
      currentPlayer === 'X'
        ? {
            label: 'Player 1 (X) to move',
            hint: 'Player 1, place an X',
            icon: User,
            accent: 'text-lime',
            accentKey: 'cyan',
          }
        : {
            label: 'Player 2 (O) to move',
            hint: 'Player 2, place an O',
            icon: User,
            accent: 'text-cyan',
            accentKey: 'violet',
          }
  } else if (currentPlayer === humanSymbol) {
    info = {
      label: 'Your turn',
      hint: 'Place your symbol',
      icon: User,
      accent: 'text-lime',
      accentKey: 'cyan',
    }
  } else {
    info = {
      label: "Computer's turn",
      hint: 'The computer is thinking',
      icon: Bot,
      accent: 'text-cyan',
      accentKey: 'violet',
    }
  }

  const Icon = info.icon

  return (
    <div
      role="status"
      aria-live="polite"
      data-accent={info.accentKey}
      className="turn-indicator"
    >
      {mode === 'pvp' || mode === 'online' ? (
        <Users className={`size-5 ${info.accent}`} aria-hidden="true" />
      ) : (
        <Icon className={`size-5 ${info.accent}`} aria-hidden="true" />
      )}
      <span className="turn-indicator-text">{info.label}</span>
      <span className={`turn-indicator-dot ${info.accentKey === 'cyan' ? 'turn-indicator-dot--x' : info.accentKey === 'violet' ? 'turn-indicator-dot--o' : ''}`} aria-hidden="true" />
      {isThinking ? (
        <span className="flex items-center gap-1.5" aria-hidden="true">
          <span className="animate-think-pulse size-2 rounded-full bg-text" />
          <span className="animate-think-pulse size-2 rounded-full bg-text [animation-delay:150ms]" />
          <span className="animate-think-pulse size-2 rounded-full bg-text [animation-delay:300ms]" />
        </span>
      ) : null}
    </div>
  )
}