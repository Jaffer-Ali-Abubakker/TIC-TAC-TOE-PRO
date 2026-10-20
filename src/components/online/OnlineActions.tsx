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
        <div className="rounded-xl border border-ink-700/80 bg-ink-900/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-mist-500">
            <Swords className="size-3.5" aria-hidden="true" />
            Rematch
          </p>

          {opponentIsWaiting ? (
            <p className="mt-2 text-sm text-glow-cyan">Your opponent wants to play again.</p>
          ) : iRequestedRematch ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-mist-300">
              <Check className="size-4 text-glow-emerald" aria-hidden="true" />
              Waiting for your opponent to accept...
            </p>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-mist-400">
              A new round starts once both players ask for it.
            </p>
          )}

          <button
            type="button"
            onClick={onRequestRematch}
            disabled={busy || iRequestedRematch}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-glow-cyan/90 to-glow-violet/90 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />
            {opponentIsWaiting ? 'Accept rematch' : 'Request rematch'}
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={onLeave}
        disabled={busy}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-ink-700 bg-ink-850/80 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:border-glow-rose/50 hover:text-glow-rose disabled:opacity-60"
      >
        <LogOut className="size-4" aria-hidden="true" />
        Leave room
      </button>

      <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
        Leaving ends the match for both players. No forfeit win is awarded.
      </p>
    </section>
  )
}
