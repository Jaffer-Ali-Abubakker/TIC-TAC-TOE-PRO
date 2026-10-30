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
    <section className="panel p-4 sm:p-6" aria-label="Online multiplayer lobby">
      <div className="mb-4 flex items-center gap-3">
        <Users className="size-5 text-lime" aria-hidden="true" />
        <h2 className="micro-label">Online multiplayer</h2>
      </div>

      <div className="panel-inset p-3">
        <label htmlFor="online-display-name" className="block text-[13px] font-medium text-muted">
          Your name (optional)
        </label>
        <div className="mt-2 flex items-center gap-2">
          <User className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <input
            id="online-display-name"
            type="text"
            value={displayName}
            maxLength={24}
            placeholder="Player"
            onChange={(event) => onDisplayNameChange(event.target.value)}
            className="w-0 min-w-0 flex-1 rounded-sm border border-border bg-card px-3 py-2 text-sm text-text placeholder:text-muted focus:border-lime/60 focus:outline-none"
          />
        </div>
        <p className="helper-text mt-2">
          A name is only a label for your opponent. It is not an account and it grants no rights.
        </p>
      </div>

      {inviteCode ? (
        <div className="mt-4 rounded-lg border-2 border-lime bg-lime/10 p-3">
          <p className="flex items-center gap-2 text-[13px] font-semibold text-lime">
            <Link2 className="size-4" aria-hidden="true" />
            You were invited to a room
          </p>
          <p className="mt-1 font-mono text-lg tracking-widest text-text">
            {formatRoomCode(inviteCode)}
          </p>
          <button
            type="button"
            onClick={() => onJoin(inviteCode)}
            disabled={busy}
            className="btn btn-secondary mt-3 w-full"
          >
            <LogIn className="size-4" aria-hidden="true" />
            Join this room
          </button>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={busy}
          className="btn btn-primary w-full"
        >
          <Bot className="size-4" aria-hidden="true" />
          Create private room
        </button>

        <div className="panel-inset p-3">
          <label htmlFor="online-room-code" className="block text-[13px] font-medium text-muted">
            Join with a room code
          </label>
          <div className="mt-2 flex gap-2">
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
              className="w-0 min-w-0 flex-1 rounded-sm border border-border bg-card px-3 py-2 font-mono text-sm uppercase tracking-widest text-text placeholder:text-muted focus:border-lime/60 focus:outline-none"
            />
            <button
              type="button"
              onClick={submitJoin}
              disabled={busy || !codeLooksValid}
              className="btn btn-secondary shrink-0"
            >
              Join
            </button>
          </div>
          {codeError ? (
            <p id="online-room-code-error" role="alert" className="mt-2 text-[12px] text-rose">
              {codeError}
            </p>
          ) : (
            <p id="online-room-code-hint" className="helper-text mt-2">
              Eight characters, for example ABCD-1234.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border-2 border-rose bg-rose/10 px-3 py-2 text-sm text-rose"
        >
          {error}
        </p>
      ) : null}
    </section>
  )
}