import { useState } from 'react'
import { Check, Copy, Link2, LogOut, Share2, UserPlus } from 'lucide-react'
import { formatRoomCode } from '../../online/roomCode'
import { copyToClipboard, shareOrCopy, type CopyOutcome } from '../../utils/clipboard'

export interface OnlineWaitingRoomProps {
  roomCode: string
  inviteLink: string | null
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
  busy,
  onLeave,
}: OnlineWaitingRoomProps) {
  const [notice, setNotice] = useState<Notice>(null)
  const formatted = formatRoomCode(roomCode)

  const handleCopyCode = async () => {
    const outcome = await copyToClipboard(roomCode)
    setNotice(noticeFor(outcome, 'Room code copied.'))
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return
    const outcome = await copyToClipboard(inviteLink)
    setNotice(noticeFor(outcome, 'Invite link copied.'))
  }

  const handleShare = async () => {
    if (!inviteLink) return
    const outcome = await shareOrCopy(
      'Tic-Tac-Toe Pro',
      `Join my Tic-Tac-Toe room ${formatted}`,
      inviteLink,
    )
    setNotice(noticeFor(outcome, 'Invite shared.'))
  }

  return (
    <section className="panel mx-auto w-full max-w-xl p-4 sm:p-6" aria-label="Waiting for opponent">
      <div className="flex flex-col items-center text-center">
        <span className="waiting-card flex size-12 items-center justify-center rounded-2xl border border-glow-cyan/40 bg-glow-cyan/10 shadow-[0_0_28px_-8px_rgb(34_211_238_/_0.6)]">
          <UserPlus className="size-5 text-glow-cyan" aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-mist-100">
          Waiting for your opponent
        </h2>
        <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-mist-400">
          Share the room code or the invite link. The match starts as soon as a second player
          joins.
        </p>

        <p className="mt-6 rounded-2xl border border-ink-600 bg-ink-950/70 px-4 py-3 text-center font-mono text-2xl tracking-[0.18em] text-mist-100 shadow-[0_0_32px_-10px_rgb(34_211_238_/_0.55)] sm:px-6 sm:text-3xl sm:tracking-[0.3em]">
          {formatted}
        </p>

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

        {notice ? (
          <p
            role="status"
            className={`mt-4 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] ${
              notice.tone === 'ok'
                ? 'bg-glow-emerald/15 text-glow-emerald'
                : 'bg-glow-rose/15 text-glow-rose'
            }`}
          >
            {notice.tone === 'ok' ? <Check className="size-4" aria-hidden="true" /> : null}
            {notice.message}
          </p>
        ) : null}

        <div className="mt-6 w-full border-t border-ink-700/70 pt-4">
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
