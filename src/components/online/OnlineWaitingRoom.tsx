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
    <section className="panel p-4 sm:p-6" aria-label="Waiting for opponent">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-11 items-center justify-center rounded-2xl border border-glow-cyan/40 bg-glow-cyan/10">
          <UserPlus className="size-5 text-glow-cyan" aria-hidden="true" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-mist-100">Waiting for your opponent</h2>
        <p className="mt-1 max-w-sm text-sm leading-relaxed text-mist-400">
          Share the room code or the invite link. The match starts as soon as a second player
          joins.
        </p>

        <p className="mt-5 rounded-2xl border border-ink-700 bg-ink-950/70 px-6 py-3 font-mono text-3xl tracking-[0.3em] text-mist-100">
          {formatted}
        </p>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={handleCopyCode}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2 text-sm font-medium text-mist-200 transition-colors hover:border-glow-cyan/50 hover:text-mist-100"
          >
            <Copy className="size-4" aria-hidden="true" />
            Copy code
          </button>
          <button
            type="button"
            onClick={handleCopyLink}
            disabled={!inviteLink}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2 text-sm font-medium text-mist-200 transition-colors hover:border-glow-cyan/50 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Link2 className="size-4" aria-hidden="true" />
            Copy invite link
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!inviteLink}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-850 px-3.5 py-2 text-sm font-medium text-mist-200 transition-colors hover:border-glow-cyan/50 hover:text-mist-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Share2 className="size-4" aria-hidden="true" />
            Share
          </button>
        </div>

        {notice ? (
          <p
            role="status"
            className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs ${
              notice.tone === 'ok'
                ? 'bg-glow-emerald/15 text-glow-emerald'
                : 'bg-glow-rose/15 text-glow-rose'
            }`}
          >
            {notice.tone === 'ok' ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {notice.message}
          </p>
        ) : null}

        <div className="mt-6 w-full border-t border-ink-700/70 pt-4">
          <button
            type="button"
            onClick={onLeave}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-850/80 px-4 py-2.5 text-sm font-medium text-mist-300 transition-colors hover:border-glow-rose/50 hover:text-glow-rose disabled:opacity-60"
          >
            <LogOut className="size-4" aria-hidden="true" />
            Leave room
          </button>
        </div>
      </div>
    </section>
  )
}
