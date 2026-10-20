/**
 * A controllable fake of the Supabase browser client.
 *
 * It lets the tests drive the online mode without a network connection:
 * RPC calls are routed to per-function handlers, the auth layer can be told
 * to return a session (or not) and realtime events can be emitted by hand.
 */
import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface RpcCall {
  name: string
  args: Record<string, unknown>
}

export interface FakeChannel {
  channel: {
    on: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
    track: ReturnType<typeof vi.fn>
    presenceState: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  /** Emits a postgres_changes event to the registered handler. */
  emitChange: (payload: unknown) => void
  /** Emits a presence sync event. */
  emitPresence: (state: Record<string, unknown[]>) => void
  subscribed: boolean
}

export interface FakeSupabase {
  client: SupabaseClient
  rpcCalls: RpcCall[]
  /** Registers the response of one RPC function. */
  onRpc: (name: string, handler: (args: Record<string, unknown>) => unknown) => void
  /** Makes an RPC fail with a controlled `online:<code>` error. */
  failRpc: (name: string, code: string) => void
  /** Makes the anonymous sign-in fail with a GoTrue style error. */
  failSignIn: (code: string, message: string) => void
  channels: FakeChannel[]
  removedChannels: number
  signedInAnonymously: number
  setSession: (userId: string | null) => void
}

function createFakeChannel(): FakeChannel {
  const changeHandlers: Array<(payload: unknown) => void> = []
  const presenceHandlers: Array<(payload: unknown) => void> = []
  let presenceState: Record<string, unknown[]> = {}

  const channel = {
    on: vi.fn((type: string, _filter: unknown, callback: (payload: unknown) => void) => {
      if (type === 'postgres_changes') changeHandlers.push(callback)
      if (type === 'presence') presenceHandlers.push(callback)
      return channel
    }),
    subscribe: vi.fn((callback?: (status: string) => void) => {
      fake.subscribed = true
      callback?.('SUBSCRIBED')
      return channel
    }),
    track: vi.fn(async () => undefined),
    presenceState: vi.fn(() => presenceState),
    remove: vi.fn(),
  }

  const fake: FakeChannel = {
    channel,
    emitChange: (payload) => {
      for (const handler of changeHandlers) handler(payload)
    },
    emitPresence: (state) => {
      presenceState = state
      for (const handler of presenceHandlers) handler(state)
    },
    subscribed: false,
  }

  return fake
}

export function createFakeSupabase(): FakeSupabase {
  const rpcCalls: RpcCall[] = []
  const handlers = new Map<string, (args: Record<string, unknown>) => unknown>()
  const channels: FakeChannel[] = []
  let sessionUserId: string | null = null
  let signedInAnonymously = 0
  let signInFailure: { code: string; message: string } | null = null

  const fake: FakeSupabase = {
    client: undefined as unknown as SupabaseClient,
    rpcCalls,
    onRpc: (name, handler) => {
      handlers.set(name, handler)
    },
    failRpc: (name, code) => {
      handlers.set(name, () => {
        throw new Error(`online:${code}`)
      })
    },
    failSignIn: (code, message) => {
      signInFailure = { code, message }
    },
    channels,
    removedChannels: 0,
    signedInAnonymously: 0,
    setSession: (userId) => {
      sessionUserId = userId
    },
  }

  const client = {
    auth: {
      getSession: vi.fn(async () => ({
        data: {
          session: sessionUserId
            ? { user: { id: sessionUserId }, access_token: 'token' }
            : null,
        },
        error: null,
      })),
      signInAnonymously: vi.fn(async () => {
        signedInAnonymously += 1
        fake.signedInAnonymously = signedInAnonymously
        if (signInFailure) {
          const error = new Error(signInFailure.message) as Error & { code?: string }
          error.code = signInFailure.code
          return { data: { user: null, session: null }, error }
        }
        sessionUserId = 'anonymous-user'
        return { data: { user: { id: 'anonymous-user' } }, error: null }
      }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args })
      const handler = handlers.get(name)
      if (!handler) {
        return {
          data: null,
          error: { message: `No handler registered for ${name}`, code: 'P0001' },
        }
      }
      try {
        const result = handler(args)
        return { data: result, error: null }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { data: null, error: { message, code: 'P0001' } }
      }
    }),
    channel: vi.fn(() => {
      const channel = createFakeChannel()
      channels.push(channel)
      return channel.channel
    }),
    removeChannel: vi.fn(async () => {
      fake.removedChannels += 1
    }),
  }

  fake.client = client as unknown as SupabaseClient
  return fake
}

/** Builds a valid room payload as the database would return it. */
export function makeRoomPayload(overrides: Record<string, unknown> = {}) {
  return {
    room: {
      id: 'room-uuid',
      joinCode: 'ABCD1234',
      status: 'waiting',
      board: [null, null, null, null, null, null, null, null, null],
      currentTurn: 'X',
      winnerSymbol: null,
      result: null,
      winningCombination: null,
      version: 1,
      roundNumber: 1,
      lastMoveIndex: null,
      movesPlayed: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      expiresAt: '2026-01-01T02:00:00.000Z',
      ...overrides,
    },
    players: [
      {
        userId: 'anonymous-user',
        symbol: 'X',
        displayName: 'Alice',
        isOwner: true,
        rematchRequested: false,
        joinedAt: '2026-01-01T00:00:00.000Z',
        lastSeenAt: '2026-01-01T00:00:00.000Z',
      },
    ],
    mySymbol: 'X',
  }
}
