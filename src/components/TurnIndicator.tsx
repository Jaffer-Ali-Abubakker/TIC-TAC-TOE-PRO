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
        accent: 'text-mist-300',
      }
    } else if (mySymbol !== null && currentPlayer === mySymbol) {
      info = {
        label: 'Your turn',
        hint: 'Place your symbol',
        icon: User,
        accent: 'text-glow-cyan',
      }
    } else {
      info = {
        label: "Opponent's turn",
        hint: 'Waiting for your opponent to move',
        icon: Bot,
        accent: 'text-glow-violet',
      }
    }
  } else if (mode === 'pvp') {
    info =
      currentPlayer === 'X'
        ? {
            label: 'Player 1 (X) to move',
            hint: 'Player 1, place an X',
            icon: User,
            accent: 'text-glow-cyan',
          }
        : {
            label: 'Player 2 (O) to move',
            hint: 'Player 2, place an O',
            icon: User,
            accent: 'text-glow-violet',
          }
  } else if (currentPlayer === humanSymbol) {
    info = {
      label: 'Your turn',
      hint: 'Place your symbol',
      icon: User,
      accent: 'text-glow-cyan',
    }
  } else {
    info = {
      label: "Computer's turn",
      hint: 'The computer is thinking',
      icon: Bot,
      accent: 'text-glow-violet',
    }
  }

  const Icon = info.icon

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2.5 rounded-xl border border-ink-700/80 bg-ink-900/60 px-4 py-2.5"
    >
      {mode === 'pvp' || mode === 'online' ? (
        <Users className={`size-4 ${info.accent}`} aria-hidden="true" />
      ) : (
        <Icon className={`size-4 ${info.accent}`} aria-hidden="true" />
      )}
      <p className="text-sm font-medium text-mist-100">
        {info.label}
        <span className="sr-only">. {info.hint}</span>
      </p>
      {isThinking ? (
        <span className="flex items-center gap-1" aria-hidden="true">
          <span className="animate-think-pulse size-1.5 rounded-full bg-glow-violet" />
          <span className="animate-think-pulse size-1.5 rounded-full bg-glow-violet [animation-delay:150ms]" />
          <span className="animate-think-pulse size-1.5 rounded-full bg-glow-violet [animation-delay:300ms]" />
        </span>
      ) : null}
    </div>
  )
}
