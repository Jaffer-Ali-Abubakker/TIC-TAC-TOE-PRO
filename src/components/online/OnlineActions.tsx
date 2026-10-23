import { Check, LogOut, RefreshCw, Swords } from 'lucide-react'

export interface OnlineActionsProps {
  busy: boolean
  /** True when the current round is over and a rematch can be requested. */
  canRematch: boolean
  iRequestedRematch: boolean
  opponentRequestedRematch: boolean
  onRequestRematch: () => void
  onLeave: () => void
}

/** Rematch and leave controls for the online mode. */
export function OnlineActions({
  busy,
  canRematch,
  iRequestedRematch,
  opponentRequestedRematch,
  onRequestRematch,
  onLeave,
}: OnlineActionsProps) {
  const opponentIsWaiting = opponentRequestedRematch && !iRequestedRematch

  return (
    <section className="panel p-4" aria-label="Online actions">
      {canRematch ? (
        <div className="panel-inset p-3">
          <p className="micro-label flex items-center gap-2">
            <Swords className="size-4" aria-hidden="true" />
            Rematch
          </p>

          {opponentIsWaiting ? (
            <p className="mt-2 text-sm text-glow-cyan">Your opponent wants to play again.</p>
          ) : iRequestedRematch ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-mist-500">
              <Check className="size-4 text-glow-emerald" aria-hidden="true" />
              Waiting for your opponent to accept...
            </p>
          ) : (
            <p className="helper-text mt-2">
              A new round starts once both players ask for it.
            </p>
          )}

          <button
            type="button"
            onClick={onRequestRematch}
            disabled={busy || iRequestedRematch}
            className="btn btn-primary mt-3 w-full"
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            {opponentIsWaiting ? 'Accept rematch' : 'Request rematch'}
          </button>
        </div>
      ) : null}

      <button type="button" onClick={onLeave} disabled={busy} className="btn btn-ghost-danger mt-3 w-full">
        <LogOut className="size-4" aria-hidden="true" />
        Leave room
      </button>

      <p className="helper-text mt-3">
        Leaving ends the match for both players. No forfeit win is awarded.
      </p>
    </section>
  )
}
