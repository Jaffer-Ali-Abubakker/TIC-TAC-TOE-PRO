import { Circle, CloudOff, Radio, RefreshCw, Wifi } from 'lucide-react'
import type { Player } from '../../game/types'
import type { OnlineConnectionStatus, OnlinePlayer } from '../../online/types'

export interface OnlinePlayersBarProps {
  players: OnlinePlayer[]
  myUserId: string | null
  mySymbol: Player | null
  connection: OnlineConnectionStatus
  opponentPresent: boolean | null
  roundNumber: number
}

const CONNECTION_COPY: Record<OnlineConnectionStatus, { label: string; tone: string }> = {
  offline: { label: 'Offline', tone: 'text-mist-500' },
  connecting: { label: 'Connecting...', tone: 'text-glow-amber' },
  connected: { label: 'Live', tone: 'text-glow-emerald' },
  reconnecting: { label: 'Reconnecting...', tone: 'text-glow-amber' },
  failed: { label: 'Sync limited - retrying', tone: 'text-glow-rose' },
}

function displayName(player: OnlinePlayer): string {
  if (player.displayName && player.displayName.trim()) return player.displayName
  return player.symbol === 'X' ? 'Player 1' : 'Player 2'
}

/** Shows both players, the round number and the connection state. */
export function OnlinePlayersBar({
  players,
  myUserId,
  mySymbol,
  connection,
  opponentPresent,
  roundNumber,
}: OnlinePlayersBarProps) {
  const connectionCopy = CONNECTION_COPY[connection]
  const ConnectionIcon =
    connection === 'connected'
      ? Wifi
      : connection === 'failed'
        ? CloudOff
        : connection === 'connecting' || connection === 'reconnecting'
          ? RefreshCw
          : Radio

  const ordered = [...players].sort((a, b) => (a.symbol === 'X' ? -1 : b.symbol === 'X' ? 1 : 0))

  return (
    <section className="panel p-3 sm:p-4" aria-label="Online match status">
      <div className="grid gap-2 sm:grid-cols-2">
        {ordered.map((player) => {
          const isMe = player.userId === myUserId
          const isOpponent = !isMe
          return (
            <div
              key={player.userId}
              className="flex items-center gap-3 rounded-xl border border-ink-700/80 bg-ink-900/60 px-3 py-2.5"
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
                  player.symbol === 'X'
                    ? 'bg-glow-cyan/15 text-glow-cyan'
                    : 'bg-glow-violet/15 text-glow-violet'
                }`}
                aria-hidden="true"
              >
                {player.symbol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium text-mist-100">
                    {displayName(player)}
                  </span>
                  {isMe ? (
                    <span className="shrink-0 rounded bg-ink-750 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-mist-400">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-[11px] text-mist-500">
                  {isMe ? `You play ${player.symbol}` : `Opponent plays ${player.symbol}`}
                </span>
              </span>
              {isOpponent ? (
                <span
                  className="shrink-0 text-[11px] font-medium"
                  title={
                    opponentPresent === null
                      ? 'Presence is not available for this room'
                      : opponentPresent
                        ? 'Opponent is online'
                        : 'Opponent appears to be offline'
                  }
                >
                  {opponentPresent === null ? (
                    <Circle className="size-3 text-mist-600" aria-hidden="true" />
                  ) : opponentPresent ? (
                    <Circle className="size-3 fill-glow-emerald text-glow-emerald" aria-hidden="true" />
                  ) : (
                    <Circle className="size-3 fill-mist-600 text-mist-600" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {opponentPresent === null
                      ? 'Opponent presence unknown'
                      : opponentPresent
                        ? 'Opponent is online'
                        : 'Opponent appears to be offline'}
                  </span>
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="mt-2.5 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-mist-500">
          Round {roundNumber}
          {mySymbol ? ` - you play ${mySymbol}` : ''}
        </span>
        <span
          role="status"
          aria-live="polite"
          className={`inline-flex items-center gap-1.5 font-medium ${connectionCopy.tone}`}
        >
          <ConnectionIcon
            className={`size-3.5 ${
              connection === 'connecting' || connection === 'reconnecting' ? 'animate-spin' : ''
            }`}
            aria-hidden="true"
          />
          {connectionCopy.label}
        </span>
      </p>
    </section>
  )
}
