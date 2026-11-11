import { useState } from 'react'
import { Check, Copy, Link2, LogOut, Share2, UserPlus } from 'lucide-react'
import type { BoardSize } from '../../game/types'
import { formatRoomCode } from '../../online/roomCode'
import type { RoomRole } from '../../online/permissions'
import { copyToClipboard, shareOrCopy, type CopyOutcome } from '../../utils/clipboard'

export interface OnlineWaitingRoomProps {
  roomCode: string
  inviteLink: string | null
  boardSize: BoardSize
  /** Only the host owns the code and the invite: the guest may only leave. */
  role: RoomRole
  /** A transient message such as "Opponent left". */
  notice?: string | null
  busy: boolean
  onLeave: () => void
}

type Notice = { tone: 'ok' | 'error'; message: string } | null

function noticeFor(outcome: CopyOutcome, success: string): Notice {
  if (outcome === 'copied' || outcome === 'shared') {
    return { tone: 'ok', message: success }
  }
  if (outcome === 'cancelled') return null
  return { tone: 'error', message: 'Copying failed. Select the text and copy it manually.' }
}

/** The waiting screen shown until the second player joins. */
export function OnlineWaitingRoom({
  roomCode,
  inviteLink,
  boardSize,
  role,
  notice,
  busy,
  onLeave,
}: OnlineWaitingRoomProps) {
  const [localNotice, setLocalNotice] = useState<Notice>(null)
  const formatted = formatRoomCode(roomCode)
  const { rows, cols, winLength } = boardSize
  const isHost = role === 'host'

  const handleCopyCode = async () => {
    const outcome = await copyToClipboard(roomCode)
    setLocalNotice(noticeFor(outcome, 'Room code copied.'))
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return
    const outcome = await copyToClipboard(inviteLink)
    setLocalNotice(noticeFor(outcome, 'Invite link copied.'))
  }

  const handleShare = async () => {
    if (!inviteLink) return
    const outcome = await shareOrCopy(
      'Tic-Tac-Toe Pro',
      `Join my Tic-Tac-Toe room ${formatted} (${rows}×${cols})`,
      inviteLink,
    )
    setLocalNotice(noticeFor(outcome, 'Invite shared.'))
  }

  return (
    <section className="panel p-4 sm:p-6" aria-label="Waiting for opponent">
      <div className="flex flex-col items-center text-center">
        <span className="waiting-card flex size-12 items-center justify-center rounded-sm border-2 border-lime bg-card shadow-panel">
          <UserPlus className="size-5 text-lime" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-bold tracking-tight text-text">
          {isHost ? 'Waiting for your opponent' : 'Waiting for the host'}
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
          {isHost
            ? `Share the room code or the invite link. The match starts as soon as a second player joins - you will play a ${rows}×${cols} board, ${winLength} in a row to win.`
            : `You joined room ${formatted} as guest (O) - you can play and leave only. The host starts the match. You will play a ${rows}×${cols} board, ${winLength} in a row to win.`}
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <p className="rounded-sm border-2 border-border bg-card px-4 py-3 text-center font-mono text-2xl tracking-[0.18em] text-text sm:text-3xl sm:tracking-[0.3em]">
            {formatted}
          </p>
          <span className="rounded-sm border-2 border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-[11px] tracking-[0.12em] text-cyan">
            {rows}×{cols}
          </span>
        </div>

        <div
          className="mt-3 grid w-fit gap-[2px] opacity-70"
          style={{ gridTemplateColumns: `repeat(${cols}, 8px)` }}
          aria-hidden="true"
        >
          {Array.from({ length: rows * cols }, (_, index) => (
            <span key={index} className="size-2 rounded-[1px] border border-border bg-void" />
          ))}
        </div>

        {isHost ? (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={handleCopyLink} disabled={!inviteLink} className="btn btn-primary">
              <Link2 className="size-4" aria-hidden="true" />
              Copy invite link
            </button>
            <button type="button" onClick={handleCopyCode} className="btn btn-secondary">
              <Copy className="size-4" aria-hidden="true" />
              Copy code
            </button>
            <button type="button" onClick={handleShare} disabled={!inviteLink} className="btn btn-ghost">
              <Share2 className="size-4" aria-hidden="true" />
              Share
            </button>
          </div>
        ) : null}

        {localNotice ? (
          <p
            role="status"
            className={`mt-4 inline-flex items-center gap-2 rounded-sm px-3 py-2 text-[13px] ${
              localNotice.tone === 'ok'
                ? 'bg-emerald/10 text-emerald border border-emerald'
                : 'bg-rose/10 text-rose border border-rose'
            }`}
          >
            {localNotice.tone === 'ok' ? <Check className="size-4" aria-hidden="true" /> : null}
            {localNotice.message}
          </p>
        ) : notice ? (
          <p
            role="alert"
            className="mt-4 rounded-lg border-2 border-lime bg-lime/10 px-3 py-2 text-sm text-lime"
          >
            {notice}
          </p>
        ) : null}

        <div className="mt-6 w-full border-t border-border pt-4">
          <button
            type="button"
            onClick={onLeave}
            disabled={busy}
            className="btn btn-ghost-danger"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Leave room
          </button>
        </div>
      </div>
    </section>
  )
}