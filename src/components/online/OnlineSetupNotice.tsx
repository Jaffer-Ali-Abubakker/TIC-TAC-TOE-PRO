import { CloudOff, Terminal } from 'lucide-react'

export interface OnlineSetupNoticeProps {
  message: string
  missing: string[]
}

/**
 * Shown when the deployment is missing the public Supabase configuration.
 * The local game modes keep working - only the online mode is disabled.
 */
export function OnlineSetupNotice({ message, missing }: OnlineSetupNoticeProps) {
  return (
    <section className="panel mx-auto w-full max-w-xl p-4 sm:p-6" aria-label="Online multiplayer setup">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-glow-amber/15 text-glow-amber">
          <CloudOff className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-mist-100">Online multiplayer is not configured</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-mist-400">{message}</p>
        </div>
      </div>

      {missing.length > 0 ? (
        <div className="panel-inset mt-4 p-3">
          <p className="micro-label flex items-center gap-2">
            <Terminal className="size-4" aria-hidden="true" />
            Required environment variables
          </p>
          <ul className="mt-2 space-y-1">
            {missing.map((name) => (
              <li key={name} className="font-mono text-[13px] text-glow-cyan">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-500">
            Copy <code className="text-mist-300">.env.example</code> to{' '}
            <code className="text-mist-300">.env</code>, fill in the values and restart the dev
            server. See the README for the full setup.
          </p>
        </div>
      ) : null}

      <p className="mt-4 text-[13px] leading-relaxed text-mist-500">
        Player vs Computer and Two Players keep working without any configuration.
      </p>
    </section>
  )
}
