import { useState } from 'react'
import { Bot, Link2, LogIn, User, Users } from 'lucide-react'
import { formatRoomCode, isValidRoomCode, normalizeRoomCode } from '../../online/roomCode'

export interface OnlineLobbyProps {
  displayName: string
  onDisplayNameChange: (name: string) => void
  busy: boolean
  error: string | null
  /** A room code that arrived through an invite link. */
  inviteCode: string | null
  onCreate: () => void
  onJoin: (code: string) => void
}

/** The online lobby: create a private room or join one with a code. */
export function OnlineLobby({
  displayName,
  onDisplayNameChange,
  busy,
  error,
  inviteCode,
  onCreate,
  onJoin,
}: OnlineLobbyProps) {
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)

  const normalized = normalizeRoomCode(code)
  const codeLooksValid = isValidRoomCode(normalized)

  const submitJoin = () => {
    if (!codeLooksValid) {
      setCodeError('Room codes have eight characters, for example ABCD-1234.')
      return
    }
    setCodeError(null)
    onJoin(normalized)
  }

  return (
    <section className="panel p-4 sm:p-5" aria-label="Online multiplayer lobby">
      <div className="mb-4 flex items-center gap-2">
        <Users className="size-4 text-glow-cyan" aria-hidden="true" />
        <h2 className="text-sm font-semibold tracking-tight text-mist-100">Online multiplayer</h2>
      </div>

      <div className="rounded-xl border border-ink-700/80 bg-ink-900/60 p-3">
        <label htmlFor="online-display-name" className="block text-xs font-medium text-mist-300">
          Your name (optional)
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <User className="size-4 shrink-0 text-mist-500" aria-hidden="true" />
          <input
            id="online-display-name"
            type="text"
            value={displayName}
            maxLength={24}
            placeholder="Player"
            onChange={(event) => onDisplayNameChange(event.target.value)}
            className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm text-mist-100 placeholder:text-mist-500 focus:border-glow-cyan/60 focus:outline-none"
          />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-mist-500">
          A name is only a label for your opponent. It is not an account and it grants no rights.
        </p>
      </div>

      {inviteCode ? (
        <div className="mt-3 rounded-xl border border-glow-cyan/45 bg-glow-cyan/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-glow-cyan">
            <Link2 className="size-3.5" aria-hidden="true" />
            You were invited to a room
          </p>
          <p className="mt-1 font-mono text-lg tracking-widest text-mist-100">
            {formatRoomCode(inviteCode)}
          </p>
          <button
            type="button"
            onClick={() => onJoin(inviteCode)}
            disabled={busy}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-glow-cyan to-glow-violet px-4 py-2.5 text-sm font-semibold text-ink-950 transition-[filter] hover:brightness-110 disabled:opacity-60"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Join this room
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-glow-cyan/90 to-glow-violet/90 px-4 py-2.5 text-sm font-semibold text-ink-950 transition-[filter] hover:brightness-110 disabled:opacity-60"
        >
          <Bot className="size-4" aria-hidden="true" />
          Create private room
        </button>

        <div className="rounded-xl border border-ink-700/80 bg-ink-900/60 p-2.5">
          <label htmlFor="online-room-code" className="block text-xs font-medium text-mist-300">
            Join with a room code
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              id="online-room-code"
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              value={code}
              placeholder="ABCD-1234"
              aria-invalid={codeError ? true : undefined}
              aria-describedby={codeError ? 'online-room-code-error' : 'online-room-code-hint'}
              onChange={(event) => {
                setCode(event.target.value.toUpperCase())
                setCodeError(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submitJoin()
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-sm uppercase tracking-widest text-mist-100 placeholder:text-mist-500 focus:border-glow-cyan/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitJoin}
              disabled={busy || !codeLooksValid}
              className="shrink-0 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-medium text-mist-200 transition-colors hover:border-glow-cyan/50 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Join
            </button>
          </div>
          {codeError ? (
            <p id="online-room-code-error" role="alert" className="mt-1.5 text-[11px] text-glow-rose">
              {codeError}
            </p>
          ) : (
            <p id="online-room-code-hint" className="mt-1.5 text-[11px] text-mist-500">
              Eight characters, for example ABCD-1234.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-glow-rose/40 bg-glow-rose/10 px-3 py-2 text-sm text-glow-rose"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}
