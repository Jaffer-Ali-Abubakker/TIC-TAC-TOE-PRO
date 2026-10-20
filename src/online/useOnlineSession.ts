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

export interface OnlineSession {
  status: OnlineSessionStatus
  userId: string | null
  error: string | null
  /** Signs in anonymously on demand (used before creating or joining a room). */
  ensureSession: () => Promise<string | null>
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

  const ensureSession = async (): Promise<string | null> => {
    const activeClient = client ?? (await getSupabaseClient())
    if (!activeClient) return null
    const { data } = await activeClient.auth.getSession()
    if (data.session?.user) {
      setUserId(data.session.user.id)
      setStatus('authenticated')
      return data.session.user.id
    }
    const { data: signedIn, error: signInError } = await activeClient.auth.signInAnonymously()
    if (signInError) {
      setError('A guest session could not be created. Please try again.')
      setStatus('error')
      return null
    }
    setUserId(signedIn.user?.id ?? null)
    setStatus('authenticated')
    return signedIn.user?.id ?? null
  }

  return { status, userId, error, ensureSession }
}
