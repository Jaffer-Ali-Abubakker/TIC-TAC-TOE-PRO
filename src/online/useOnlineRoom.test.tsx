import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createClient } from '@supabase/supabase-js'
import { useOnlineRoom } from './useOnlineRoom'
import { resetSupabaseClient } from './supabase'
import { createFakeSupabase, makeRoomPayload, type FakeSupabase } from '../test/fakeSupabase'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

const createClientMock = createClient as unknown as ReturnType<typeof vi.fn>

let supabase: FakeSupabase

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
  vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test')
  vi.stubEnv('VITE_APP_URL', 'https://play.example.com')

  supabase = createFakeSupabase()
  createClientMock.mockReturnValue(supabase.client)
  resetSupabaseClient()
})

describe('useOnlineRoom', () => {
  it('starts in the lobby', () => {
    const { result } = renderHook(() => useOnlineRoom())
    expect(result.current.phase).toBe('lobby')
    expect(result.current.room).toBeNull()
  })

  it('creates a room and waits for the opponent', async () => {
    supabase.onRpc('create_online_room', () => makeRoomPayload())
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.createRoom()
    })

    expect(result.current.room?.room.joinCode).toBe('ABCD1234')
    expect(result.current.phase).toBe('waiting')
    expect(result.current.mySymbol).toBe('X')
    expect(result.current.inviteLink).toBe('https://play.example.com/?room=ABCD1234')
  })

  it('joins a room and becomes active', async () => {
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'active' }),
      mySymbol: 'O',
    }))
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    expect(result.current.phase).toBe('active')
    expect(result.current.mySymbol).toBe('O')
  })

  it('surfaces the real reason when the guest session cannot be created', async () => {
    supabase.failSignIn('anonymous_provider_disabled', 'Anonymous sign-ins are disabled')
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.createRoom()
    })

    // The specific reason must not be replaced by a generic message.
    expect(result.current.error).toMatch(/anonymous sign-ins are disabled/i)
    expect(result.current.error).toMatch(/Authentication/i)
    expect(result.current.error).not.toMatch(/A guest session is required/)
  })

  it('rejects a malformed room code without calling the server', async () => {
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('nope')
    })

    expect(supabase.rpcCalls).toHaveLength(0)
    expect(result.current.error).toMatch(/not valid/i)
  })

  it('surfaces a friendly error when the room is full', async () => {
    supabase.failRpc('join_online_room', 'room_full')
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    expect(result.current.error).toMatch(/already full/i)
    expect(result.current.errorCode).toBe('room_full')
  })

  it('submits a move with the current version', async () => {
    supabase.onRpc('join_online_room', () =>
      makeRoomPayload({ status: 'active', mySymbol: 'X', version: 3 }),
    )
    supabase.onRpc('submit_online_move', () =>
      makeRoomPayload({
        status: 'active',
        version: 4,
        board: ['X', null, null, null, null, null, null, null, null],
        movesPlayed: 1,
        currentTurn: 'O',
        lastMoveIndex: 0,
      }),
    )

    const { result } = renderHook(() => useOnlineRoom())
    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    await act(async () => {
      await result.current.submitMove(0)
    })

    const call = supabase.rpcCalls.find((entry) => entry.name === 'submit_online_move')
    expect(call?.args.p_cell_index).toBe(0)
    expect(call?.args.p_expected_version).toBe(3)
    expect(result.current.room?.room.board[0]).toBe('X')
  })

  it('reuses the move id when the same cell is retried', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active' }))
    supabase.failRpc('submit_online_move', 'not_your_turn')

    const { result } = renderHook(() => useOnlineRoom())
    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    await act(async () => {
      await result.current.submitMove(2)
    })
    await act(async () => {
      await result.current.submitMove(2)
    })

    const moves = supabase.rpcCalls.filter((entry) => entry.name === 'submit_online_move')
    expect(moves).toHaveLength(2)
    expect(moves[0].args.p_move_id).toBe(moves[1].args.p_move_id)
  })

  it('refuses to move when it is not the players turn', async () => {
    supabase.onRpc('join_online_room', () => ({
      ...makeRoomPayload({ status: 'active', currentTurn: 'X' }),
      mySymbol: 'O',
    }))
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })
    await act(async () => {
      await result.current.submitMove(0)
    })

    expect(supabase.rpcCalls.some((entry) => entry.name === 'submit_online_move')).toBe(false)
    expect(result.current.error).toMatch(/not your turn/i)
  })

  it('leaves the room', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active' }))
    supabase.onRpc('leave_online_room', () => ({ left: true }))

    const { result } = renderHook(() => useOnlineRoom())
    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })
    expect(result.current.room).not.toBeNull()

    await act(async () => {
      await result.current.leaveRoom()
    })

    expect(result.current.room).toBeNull()
    expect(result.current.phase).toBe('lobby')
  })

  it('never rolls the board back to an older version', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active', version: 5 }))
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })
    expect(result.current.room?.room.version).toBe(5)

    // The server now reports an older state (a delayed or duplicated event).
    supabase.onRpc('get_online_room_state', () => makeRoomPayload({ status: 'active', version: 2 }))
    await act(async () => {
      await result.current.leaveRoom()
      await result.current.joinRoom('ABCD1234')
    })

    expect(result.current.room?.room.version).toBe(5)
  })

  it('subscribes to the realtime channel of the room', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active' }))
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    await waitFor(() => {
      expect(supabase.channels.length).toBeGreaterThan(0)
    })
    expect(supabase.channels[0].subscribed).toBe(true)
    expect(result.current.connection).toBe('connected')
  })

  it('refreshes the authoritative state when realtime fires', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active', version: 2 }))
    const { result } = renderHook(() => useOnlineRoom())

    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    supabase.onRpc('get_online_room_state', () =>
      makeRoomPayload({
        status: 'active',
        version: 3,
        board: ['X', null, null, null, null, null, null, null, null],
        movesPlayed: 1,
        currentTurn: 'O',
      }),
    )

    await waitFor(() => {
      expect(supabase.channels[0]).toBeDefined()
    })

    await act(async () => {
      supabase.channels[0].emitChange({})
    })

    await waitFor(() => {
      expect(result.current.room?.room.version).toBe(3)
    })
  })

  it('cleans the subscription up when the room is left', async () => {
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active' }))
    supabase.onRpc('leave_online_room', () => ({ left: true }))

    const { result, unmount } = renderHook(() => useOnlineRoom())
    await act(async () => {
      await result.current.joinRoom('ABCD1234')
    })

    await act(async () => {
      await result.current.leaveRoom()
    })

    await waitFor(() => {
      expect(supabase.removedChannels).toBeGreaterThan(0)
    })

    unmount()
  })
})
