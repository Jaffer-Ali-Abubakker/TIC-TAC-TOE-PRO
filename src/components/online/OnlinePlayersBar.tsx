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

const CONNECTION_COPY: Record<
  OnlineConnectionStatus,
  { label: string; tone: string; pill: string }
> = {
  offline: { label: 'Offline', tone: 'text-muted', pill: 'border-border bg-card' },
  connecting: {
    label: 'Connecting...',
    tone: 'text-amber',
    pill: 'border-amber bg-amber/10',
  },
  connected: {
    label: 'Live',
    tone: 'text-emerald',
    pill: 'border-emerald bg-emerald/10',
  },
  reconnecting: {
    label: 'Reconnecting...',
    tone: 'text-amber',
    pill: 'border-amber bg-amber/10',
  },
  failed: {
    label: 'Sync limited - retrying',
    tone: 'text-rose',
    pill: 'border-rose bg-rose/10',
  },
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
              className="panel-inset flex items-center gap-3 px-3 py-2"
            >
              <span
                className={`flex size-8 shrink-0 items-center justify-center rounded-sm text-sm font-bold ${
                  player.symbol === 'X'
                    ? 'bg-lime/10 text-lime border border-lime'
                    : 'bg-cyan/10 text-cyan border border-cyan'
                }`}
                aria-hidden="true"
              >
                {player.symbol}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-text">
                    {displayName(player)}
                  </span>
                  {isMe ? (
                    <span className="shrink-0 rounded bg-border px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-muted">
                      You
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-muted">
                  {isMe ? `You play ${player.symbol}` : `Opponent plays ${player.symbol}`}
                </span>
              </span>
              {isOpponent ? (
                <span
                  className="shrink-0 text-[12px] font-medium"
                  title={
                    opponentPresent === null
                      ? 'Presence is not available for this room'
                      : opponentPresent
                        ? 'Opponent is online'
                        : 'Opponent appears to be offline'
                  }
                >
                  {opponentPresent === null ? (
                    <Circle className="size-3.5 text-muted" aria-hidden="true" />
                  ) : opponentPresent ? (
                    <Circle
                      className="size-3.5 fill-emerald text-emerald"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle className="size-3.5 fill-muted text-muted" aria-hidden="true" />
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

      <p className="mt-3 flex items-center justify-between gap-2 text-[13px]">
        <span className="text-muted">
          Round {roundNumber}
          {mySymbol ? ` - you play ${mySymbol}` : ''}
        </span>
        <span
          role="status"
          aria-live="polite"
          data-connection={connection}
          className={`inline-flex items-center gap-2 rounded-sm border px-2 py-1 text-[13px] font-semibold ${connectionCopy.pill} ${connectionCopy.tone}`}
        >
          {connection === 'connected' ? (
            <span className="live-dot size-2 rounded-full bg-emerald" aria-hidden="true" />
          ) : null}
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