/**
 * The online room controller.
 *
 * Responsibilities:
 *   - create / join / leave a private room
 *   - keep the authoritative state in sync (realtime + a polling safety net)
 *   - submit moves and rematch requests through the database
 *   - survive reconnects without duplicating moves
 *
 * The hook never decides whether a move is legal - the database does.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Player } from '../game/types'
import {
  createOnlineRoom,
  fetchOnlineRoomState,
  joinOnlineRoom,
  leaveOnlineRoom,
  requestOnlineRematch,
  submitOnlineMove,
  toOnlineError,
} from './onlineApi'
import { createMoveId, isValidRoomCode, normalizeRoomCode } from './roomCode'
import { getOnlineConfig, getSupabaseClient } from './supabase'
import { useOnlineSession } from './useOnlineSession'
import type {
  OnlineConnectionStatus,
  OnlineErrorCode,
  OnlinePhase,
  OnlineRoomState,
} from './types'

/** How often the authoritative state is re-read as a safety net. */
const POLL_INTERVAL_MS = 2500

/** The realtime channel name for a room. */
export function roomChannelName(roomId: string): string {
  return `online-room:${roomId}`
}

export interface OnlineRoomController {
  phase: OnlinePhase
  room: OnlineRoomState | null
  mySymbol: Player | null
  /** The authenticated (anonymous) user id of this browser. */
  userId: string | null
  connection: OnlineConnectionStatus
  error: string | null
  errorCode: OnlineErrorCode | null
  busy: boolean
  displayName: string
  setDisplayName: (name: string) => void
  roomCode: string | null
  inviteLink: string | null
  /** `null` when presence is unavailable, otherwise whether the opponent is around. */
  opponentPresent: boolean | null
  iRequestedRematch: boolean
  opponentRequestedRematch: boolean
  createRoom: () => Promise<void>
  joinRoom: (code: string) => Promise<void>
  leaveRoom: () => Promise<void>
  submitMove: (cellIndex: number) => Promise<void>
  requestRematch: () => Promise<void>
  clearError: () => void
  /** Returns to the lobby and forgets the current room. */
  reset: () => void
}

export function useOnlineRoom(): OnlineRoomController {
  const [client, setClient] = useState<SupabaseClient | null>(null)
  const session = useOnlineSession(client)
  const config = useMemo(() => getOnlineConfig(), [])

  const [room, setRoom] = useState<OnlineRoomState | null>(null)
  /** The phase while no room is joined (lobby, connecting, error). */
  const [basePhase, setBasePhase] = useState<OnlinePhase>(config ? 'lobby' : 'unconfigured')
  const [connection, setConnection] = useState<OnlineConnectionStatus>('offline')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<OnlineErrorCode | null>(null)
  const [busy, setBusy] = useState(false)
  const [displayName, setDisplayNameState] = useState(() => loadDisplayName())
  const [opponentPresent, setOpponentPresent] = useState<boolean | null>(null)

  const roomRef = useRef<OnlineRoomState | null>(null)
  const codeRef = useRef<string | null>(null)
  const lastAttemptRef = useRef<{ cellIndex: number; moveId: string } | null>(null)

  const configured = config !== null
  const userId = session.userId

  /* ------------------------------------------------------------------ *
   * The Supabase client is loaded lazily so the library is only fetched
   * when the online mode is actually used.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!configured) return
    let cancelled = false
    void getSupabaseClient().then((loaded) => {
      if (!cancelled) setClient(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [configured])

  /* ------------------------------------------------------------------ *
   * State helpers
   * ------------------------------------------------------------------ */

  /**
   * Applies an authoritative snapshot.
   * Older versions are ignored so an out of order event can never roll the
   * board back.
   */
  const applyState = useCallback((next: OnlineRoomState) => {
    const current = roomRef.current
    if (current && next.room.version < current.room.version) return
    roomRef.current = next
    setRoom(next)
    codeRef.current = next.room.joinCode
  }, [])
  const clearError = useCallback(() => {
    setError(null)
    setErrorCode(null)
  }, [])

  const setDisplayName = useCallback((name: string) => {
    const value = name.slice(0, 24)
    setDisplayNameState(value)
    saveDisplayName(value)
  }, [])

  const fail = useCallback((thrown: unknown) => {
    const onlineError = toOnlineError(thrown)
    setError(onlineError.message)
    setErrorCode(onlineError.code)
  }, [])

  /* ------------------------------------------------------------------ *
   * Reading the authoritative state
   * ------------------------------------------------------------------ */

  const refresh = useCallback(async () => {
    const code = codeRef.current
    const activeClient = client ?? (await getSupabaseClient())
    if (!activeClient || !code) return

    try {
      const state = await fetchOnlineRoomState(activeClient, code)
      applyState(state)
      setConnection('connected')
    } catch (thrown) {
      const onlineError = toOnlineError(thrown)
      if (
        onlineError.code === 'not_a_member' ||
        onlineError.code === 'room_not_found' ||
        onlineError.code === 'room_expired'
      ) {
        // The seat is gone - fall back to the lobby instead of showing a
        // board that can no longer be played.
        roomRef.current = null
        codeRef.current = null
        setRoom(null)
        setBasePhase('lobby')
        setOpponentPresent(null)
      }
      setError(onlineError.message)
      setErrorCode(onlineError.code)
    }
  }, [applyState, client])

  /* ------------------------------------------------------------------ *
   * Realtime subscription
   * ------------------------------------------------------------------ */

  const roomId = room?.room.id ?? null
  const mySymbol = room?.mySymbol ?? null

  useEffect(() => {
    if (!roomId || !client || !userId) return

    let cancelled = false

    // The channel is created first and subscribed afterwards: some realtime
    // implementations invoke the subscribe callback synchronously, and the
    // callback needs a reference to the channel.
    const channel = client.channel(roomChannelName(roomId), { config: { private: true } })

    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'online_rooms',
        filter: `id=eq.${roomId}`,
      },
      () => {
        // The event is only a hint - the state is re-read from the database.
        void refresh()
      },
    )

    channel.on('presence', { event: 'sync' }, () => {
      if (cancelled) return
      const presence = channel.presenceState()
      const others = Object.values(presence)
        .flat()
        .filter((entry) => {
          const payload = entry as { userId?: unknown }
          return payload.userId !== userId
        })
      setOpponentPresent(others.length > 0)
    })

    channel.subscribe((status) => {
      if (cancelled) return
      if (status === 'SUBSCRIBED') {
        setConnection('connected')
        setOpponentPresent(null)
        void channel.track({ userId, symbol: mySymbol, at: Date.now() })
        void refresh()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setConnection('failed')
        setOpponentPresent(null)
      } else if (status === 'CLOSED') {
        setConnection('reconnecting')
      }
    })

    return () => {
      cancelled = true
      void client.removeChannel(channel)
    }
  }, [client, roomId, userId, mySymbol, refresh])

  /* ------------------------------------------------------------------ *
   * Polling safety net
   * ------------------------------------------------------------------ *
   * Realtime is the fast path. The poll guarantees that both devices still
   * converge even when the realtime channel is blocked or misconfigured.
   */
  useEffect(() => {
    if (!room) return

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      void refresh()
    }, POLL_INTERVAL_MS)

    return () => window.clearInterval(interval)
  }, [room, refresh])

  /* ------------------------------------------------------------------ *
   * Actions
   * ------------------------------------------------------------------ */

  const createRoom = useCallback(async () => {
    const activeClient = client ?? (await getSupabaseClient())
    if (!activeClient) {
      setError('Online multiplayer is not configured on this deployment.')
      setErrorCode('unknown')
      return
    }

    setBusy(true)
    clearError()
    try {
      const user = await session.ensureSession()
      if (!user) {
        setError('A guest session is required to create a room.')
        setErrorCode('unauthenticated')
        return
      }
      const state = await createOnlineRoom(activeClient, displayName)
      applyState(state)
    } catch (thrown) {
      fail(thrown)
      setBasePhase('error')
    } finally {
      setBusy(false)
    }
  }, [applyState, clearError, client, displayName, fail, session])

  const joinRoom = useCallback(
    async (code: string) => {
      const normalized = normalizeRoomCode(code)
      const activeClient = client ?? (await getSupabaseClient())
      if (!activeClient) {
        setError('Online multiplayer is not configured on this deployment.')
        setErrorCode('unknown')
        return
      }
      if (!isValidRoomCode(normalized)) {
        setError('That room code is not valid. Codes are eight characters, for example ABCD-1234.')
        setErrorCode('invalid_code')
        return
      }

      setBusy(true)
      clearError()
      setBasePhase('connecting')
      setConnection('connecting')
      try {
        const user = await session.ensureSession()
        if (!user) {
          setError('A guest session is required to join a room.')
          setErrorCode('unauthenticated')
          setBasePhase('lobby')
          return
        }

        try {
          const state = await joinOnlineRoom(activeClient, normalized, displayName)
          applyState(state)
        } catch (thrown) {
          const onlineError = toOnlineError(thrown)
          if (onlineError.code === 'already_in_room') {
            // The visitor already has a seat (for example they created the
            // room). Re-read the state instead of showing an error.
            const state = await fetchOnlineRoomState(activeClient, normalized)
            applyState(state)
          } else {
            throw thrown
          }
        }

        setBasePhase('lobby')
      } catch (thrown) {
        fail(thrown)
        setBasePhase('error')
      } finally {
        setBusy(false)
      }
    },
    [applyState, clearError, client, displayName, fail, session],
  )

  const leaveRoom = useCallback(async () => {
    const code = codeRef.current
    const activeClient = client ?? (await getSupabaseClient())
    roomRef.current = null
    codeRef.current = null
    setRoom(null)
    setBasePhase('lobby')
    setOpponentPresent(null)
    clearError()
    if (!activeClient || !code) return
    try {
      await leaveOnlineRoom(activeClient, code)
    } catch {
      // Leaving is best effort - the room expires on its own.
    }
  }, [clearError, client])

  const submitMove = useCallback(
    async (cellIndex: number) => {
      const current = roomRef.current
      const activeClient = client ?? (await getSupabaseClient())
      if (!activeClient || !current) return
      if (current.room.status !== 'active') return
      if (current.mySymbol === null) return
      if (current.room.currentTurn !== current.mySymbol) {
        setError('It is not your turn.')
        setErrorCode('not_your_turn')
        return
      }

      // Reuse the move id when the same cell is retried so the server can
      // recognise the duplicate and apply it only once.
      const previous = lastAttemptRef.current
      const moveId =
        previous && previous.cellIndex === cellIndex
          ? previous.moveId
          : createMoveId()
      lastAttemptRef.current = { cellIndex, moveId }

      setBusy(true)
      try {
        const state = await submitOnlineMove(activeClient, {
          joinCode: current.room.joinCode,
          cellIndex,
          expectedVersion: current.room.version,
          moveId,
        })
        lastAttemptRef.current = null
        applyState(state)
        clearError()
      } catch (thrown) {
        const onlineError = toOnlineError(thrown)
        setError(onlineError.message)
        setErrorCode(onlineError.code)
        // The board on the other device is authoritative - reload it.
        void refresh()
      } finally {
        setBusy(false)
      }
    },
    [applyState, clearError, client, refresh],
  )

  const requestRematch = useCallback(async () => {
    const current = roomRef.current
    const activeClient = client ?? (await getSupabaseClient())
    if (!activeClient || !current) return

    setBusy(true)
    try {
      const state = await requestOnlineRematch(activeClient, current.room.joinCode)
      applyState(state)
      clearError()
    } catch (thrown) {
      fail(thrown)
    } finally {
      setBusy(false)
    }
  }, [applyState, clearError, client, fail])

  const reset = useCallback(() => {
    roomRef.current = null
    codeRef.current = null
    lastAttemptRef.current = null
    setRoom(null)
    setBasePhase(configured ? 'lobby' : 'unconfigured')
    setOpponentPresent(null)
    clearError()
  }, [clearError, configured])

  /* ------------------------------------------------------------------ *
   * Derived values
   * ------------------------------------------------------------------ */

  const inviteLink = useMemo(() => {
    const code = room?.room.joinCode
    if (!code || !config) return null
    try {
      return buildInvite(config.appUrl, code)
    } catch {
      return null
    }
  }, [room?.room.joinCode, config])

  const iRequestedRematch =
    room?.players.find((player) => player.userId === userId)?.rematchRequested ?? false
  const opponentRequestedRematch =
    room?.players.find((player) => player.userId !== userId)?.rematchRequested ?? false

  /**
   * The phase is derived from the room whenever one is joined, so an
   * authoritative update can never leave the UI in a stale phase.
   */
  const phase: OnlinePhase = useMemo(() => {
    if (!configured) return 'unconfigured'
    if (!room) return basePhase
    if (room.room.status === 'waiting') return 'waiting'
    if (room.room.status === 'active') return 'active'
    return 'finished'
  }, [configured, room, basePhase])

  return {
    phase,
    room,
    mySymbol: mySymbol,
    userId,
    connection,
    error,
    errorCode,
    busy,
    displayName,
    setDisplayName,
    roomCode: room?.room.joinCode ?? null,
    inviteLink,
    opponentPresent,
    iRequestedRematch,
    opponentRequestedRematch,
    createRoom,
    joinRoom,
    leaveRoom,
    submitMove,
    requestRematch,
    clearError,
    reset,
  }
}

/* -------------------------------------------------------------------- *
 * Display name persistence
 * -------------------------------------------------------------------- */

const DISPLAY_NAME_KEY = 'tic-tac-toe-pro:display-name'

function loadDisplayName(): string {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return ''
    return (window.localStorage.getItem(DISPLAY_NAME_KEY) ?? '').slice(0, 24)
  } catch {
    return ''
  }
}

function saveDisplayName(name: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    if (name) {
      window.localStorage.setItem(DISPLAY_NAME_KEY, name)
    } else {
      window.localStorage.removeItem(DISPLAY_NAME_KEY)
    }
  } catch {
    // ignore
  }
}

function buildInvite(baseUrl: string, code: string): string {
  const url = new URL(baseUrl)
  url.searchParams.set('room', code)
  return url.toString()
}
