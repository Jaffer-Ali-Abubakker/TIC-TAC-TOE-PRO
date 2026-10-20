/**
 * The Supabase browser client.
 *
 * The client is created lazily and only when the public configuration is
 * valid, so the local game modes keep working without any Supabase setup.
 * The library itself is imported dynamically, which keeps it out of the
 * initial bundle for players who never use the online mode.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { readOnlineConfig, type OnlineConfig } from './config'

let client: SupabaseClient | null = null
let clientPromise: Promise<SupabaseClient | null> | null = null
let clientKey: string | null = null
let cachedConfig: OnlineConfig | null = null

/** The resolved configuration, or `null` when online play is not configured. */
export function getOnlineConfig(): OnlineConfig | null {
  if (cachedConfig) return cachedConfig
  const result = readOnlineConfig()
  if (!result.ok) return null
  cachedConfig = result.config
  return cachedConfig
}

/** True when the public configuration is complete. */
export function isOnlineConfigured(): boolean {
  return getOnlineConfig() !== null
}

/**
 * Loads the shared Supabase client, or resolves to `null` when the
 * application is not configured for online play.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  const config = getOnlineConfig()
  if (!config) return null

  const key = `${config.supabaseUrl}|${config.supabasePublishableKey}`
  if (client && clientKey === key) return client

  if (!clientPromise || clientKey !== key) {
    clientKey = key
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const created = createClient(config.supabaseUrl, config.supabasePublishableKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
        realtime: {
          params: { eventsPerSecond: 10 },
        },
      })
      client = created
      return created
    })
  }

  return clientPromise
}

/** Drops the cached client. Used by the tests. */
export function resetSupabaseClient(): void {
  client = null
  clientPromise = null
  clientKey = null
  cachedConfig = null
}
