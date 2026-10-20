/**
 * Runtime configuration for the online multiplayer mode.
 *
 * Only PUBLIC browser configuration is read here. The service role key must
 * never be placed in a `VITE_` variable - everything prefixed with `VITE_`
 * ends up in the built JavaScript bundle and is visible to every visitor.
 */

export interface OnlineConfig {
  /** Supabase project URL, e.g. https://abcdefgh.supabase.co */
  supabaseUrl: string
  /** Publishable (formerly "anon") key. It is public by design. */
  supabasePublishableKey: string
  /** Public base URL of this application, used to build invite links. */
  appUrl: string
}

export type ConfigResult =
  | { ok: true; config: OnlineConfig }
  | { ok: false; error: string; missing: string[] }

export type EnvSource = Record<string, string | undefined>

function readEnv(): EnvSource {
  try {
    return (import.meta.env ?? {}) as EnvSource
  } catch {
    return {}
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Validates the environment. Returns a friendly, actionable message when
 * something is missing so the UI can explain exactly what to configure.
 */
export function readOnlineConfig(env: EnvSource = readEnv()): ConfigResult {
  const missing: string[] = []

  const supabaseUrl = (env.VITE_SUPABASE_URL ?? '').trim()
  const supabasePublishableKey = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  const appUrl = (env.VITE_APP_URL ?? '').trim()

  if (!supabaseUrl) {
    missing.push('VITE_SUPABASE_URL')
  } else if (!isValidUrl(supabaseUrl)) {
    return {
      ok: false,
      error: 'VITE_SUPABASE_URL is not a valid URL. Use the format https://<project>.supabase.co',
      missing: ['VITE_SUPABASE_URL'],
    }
  }

  if (!supabasePublishableKey) {
    missing.push('VITE_SUPABASE_PUBLISHABLE_KEY')
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Online multiplayer is not configured. Add ${missing.join(' and ')} to your .env file.`,
      missing,
    }
  }

  const resolvedAppUrl = appUrl && isValidUrl(appUrl) ? appUrl : fallbackOrigin()

  return {
    ok: true,
    config: {
      supabaseUrl,
      supabasePublishableKey,
      appUrl: resolvedAppUrl,
    },
  }
}

function fallbackOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return 'http://localhost:5173'
}

/** A short, safe description of the configuration problem (for the UI). */
export function describeConfigProblem(result: ConfigResult): string | null {
  if (result.ok) return null
  return result.error
}
