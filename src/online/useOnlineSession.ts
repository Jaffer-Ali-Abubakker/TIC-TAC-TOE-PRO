/**
 * Anonymous authentication.
 *
 * Casual players never create an account: Supabase anonymous sign-in creates
 * a real authenticated user behind the scenes, so the database can still use
 * `auth.uid()` for authorisation. The session is persisted in the browser,
 * which means it is tied to this browser profile.
 */
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase'

export type OnlineSessionStatus = 'idle' | 'loading' | 'authenticated' | 'error'

/** The outcome of an attempted guest sign-in. */
export interface SessionAttempt {
  userId: string | null
  error: string | null
  errorCode: string | null
}

export interface OnlineSession {
  status: OnlineSessionStatus
  userId: string | null
  error: string | null
  /** Signs in anonymously on demand (used before creating or joining a room). */
  ensureSession: () => Promise<SessionAttempt>
}

/**
 * Turns a GoTrue error into something a player can act on.
 * The most common cause by far is that anonymous sign-ins are switched off in
 * the Supabase dashboard.
 */
function describeAuthError(error: unknown): { message: string; code: string } {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : ''
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  if (code === 'anonymous_provider_disabled' || /anonymous sign-ins are disabled/i.test(raw)) {
    return {
      code: 'anonymous_provider_disabled',
      message:
        'Anonymous sign-ins are disabled on this Supabase project. Enable them under Authentication -> Sign In / Providers -> Email, then try again.',
    }
  }
  if (code === 'over_request_rate_limit' || /rate limit/i.test(raw)) {
    return { code: 'over_request_rate_limit', message: 'Too many sign-in attempts. Please wait a minute and try again.' }
  }
  if (/fetch|network|timeout/i.test(raw)) {
    return { code: 'network', message: 'Could not reach the server. Check your network connection and try again.' }
  }
  return { code: 'session_unavailable', message: 'A guest session could not be created. Please try again.' }
}

export function useOnlineSession(client: SupabaseClient | null): OnlineSession {
  const [status, setStatus] = useState<OnlineSessionStatus>(client ? 'loading' : 'idle')
  const [userId, setUserId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!client) return

    let cancelled = false

    const establish = async () => {
      try {
        const { data } = await client.auth.getSession()
        if (cancelled) return

        if (data.session?.user) {
          setUserId(data.session.user.id)
          setStatus('authenticated')
          return
        }

        const { data: signedIn, error: signInError } = await client.auth.signInAnonymously()
        if (cancelled) return

        if (signInError) {
          setError(
            'A guest session could not be created. Check that anonymous sign-in is enabled in Supabase.',
          )
          setStatus('error')
          return
        }

        setUserId(signedIn.user?.id ?? null)
        setStatus('authenticated')
      } catch {
        if (cancelled) return
        setError('A guest session could not be created. Check your network connection.')
        setStatus('error')
      }
    }

    void establish()

    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.user) {
        setUserId(session.user.id)
        setStatus('authenticated')
        setError(null)
      } else {
        setUserId(null)
        setStatus('loading')
      }
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [client])

  const ensureSession = async (): Promise<SessionAttempt> => {
    const activeClient = client ?? (await getSupabaseClient())
    if (!activeClient) {
      const message = 'Online multiplayer is not configured on this deployment.'
      setError(message)
      setStatus('error')
      return { userId: null, error: message, errorCode: 'not_configured' }
    }

    try {
      const { data } = await activeClient.auth.getSession()
      if (data.session?.user) {
        setUserId(data.session.user.id)
        setStatus('authenticated')
        return { userId: data.session.user.id, error: null, errorCode: null }
      }

      const { data: signedIn, error: signInError } = await activeClient.auth.signInAnonymously()
      if (signInError) {
        const described = describeAuthError(signInError)
        setError(described.message)
        setStatus('error')
        return { userId: null, error: described.message, errorCode: described.code }
      }

      const userId = signedIn.user?.id ?? null
      if (!userId) {
        const message = 'A guest session could not be created. Please try again.'
        setError(message)
        setStatus('error')
        return { userId: null, error: message, errorCode: 'session_unavailable' }
      }

      setUserId(userId)
      setStatus('authenticated')
      setError(null)
      return { userId, error: null, errorCode: null }
    } catch (thrown) {
      const described = describeAuthError(thrown)
      setError(described.message)
      setStatus('error')
      return { userId: null, error: described.message, errorCode: described.code }
    }
  }

  return { status, userId, error, ensureSession }
}
