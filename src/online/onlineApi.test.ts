import { describe, expect, it } from 'vitest'
import {
  createOnlineRoom,
  fetchOnlineRoomState,
  joinOnlineRoom,
  leaveOnlineRoom,
  parseOnlineRoomState,
  requestOnlineRematch,
  submitOnlineMove,
  toOnlineError,
} from './onlineApi'
import { createFakeSupabase, makeRoomPayload } from '../test/fakeSupabase'

describe('parseOnlineRoomState', () => {
  it('accepts a well formed payload', () => {
    const state = parseOnlineRoomState(makeRoomPayload())
    expect(state).not.toBeNull()
    expect(state?.room.joinCode).toBe('ABCD1234')
    expect(state?.mySymbol).toBe('X')
    expect(state?.players).toHaveLength(1)
  })

  it('rejects a malformed payload', () => {
    expect(parseOnlineRoomState(null)).toBeNull()
    expect(parseOnlineRoomState({})).toBeNull()
    expect(parseOnlineRoomState({ room: { board: [1, 2] } })).toBeNull()
    expect(parseOnlineRoomState({ room: { board: new Array(9).fill(null) } })).not.toBeNull()
  })

  it('never trusts a board with the wrong number of cells', () => {
    const payload = makeRoomPayload()
    const broken = { ...payload, room: { ...payload.room, board: new Array(5).fill(null) } }
    expect(parseOnlineRoomState(broken)).toBeNull()
  })

  it('reads the room geometry and checks the board against it', () => {
    const payload = makeRoomPayload()
    const large = {
      ...payload,
      room: {
        ...payload.room,
        rows: 6,
        cols: 6,
        winLength: 4,
        board: new Array(36).fill(null),
      },
    }

    const state = parseOnlineRoomState(large)
    expect(state?.room.rows).toBe(6)
    expect(state?.room.cols).toBe(6)
    expect(state?.room.winLength).toBe(4)
    expect(state?.room.board).toHaveLength(36)

    // A board that does not fit the announced geometry is rejected.
    const mismatched = { ...large, room: { ...large.room, board: new Array(9).fill(null) } }
    expect(parseOnlineRoomState(mismatched)).toBeNull()
  })

  it('treats a room without geometry as the classic 3x3', () => {
    const payload = makeRoomPayload()
    const legacy = {
      ...payload,
      room: { ...payload.room, rows: undefined, cols: undefined, winLength: undefined },
    }

    const state = parseOnlineRoomState(legacy)
    expect(state?.room.rows).toBe(3)
    expect(state?.room.cols).toBe(3)
    expect(state?.room.winLength).toBe(3)
  })
})

describe('error mapping', () => {
  it('maps a known server code to a friendly message', () => {
    const error = toOnlineError(new Error('online:room_not_found'))
    expect(error.code).toBe('room_not_found')
    expect(error.message).toMatch(/no room/i)
  })

  it('maps a network failure', () => {
    const error = toOnlineError(new Error('Failed to fetch'))
    expect(error.code).toBe('network')
  })

  it('never leaks an unknown database error', () => {
    const error = toOnlineError(new Error('syntax error at or near "select"'))
    expect(error.code).toBe('unknown')
    expect(error.message).not.toMatch(/syntax/i)
  })
})

describe('api calls', () => {
  it('creates a room through the trusted function', async () => {
    const supabase = createFakeSupabase()
    supabase.onRpc('create_online_room', () => makeRoomPayload())

    const state = await createOnlineRoom(supabase.client, 'Alice', {
      rows: 3,
      cols: 3,
      winLength: 3,
    })
    expect(state.room.joinCode).toBe('ABCD1234')
    expect(supabase.rpcCalls[0]).toEqual({
      name: 'create_online_room',
      args: { p_display_name: 'Alice', p_rows: 3, p_cols: 3 },
    })
  })

  it('refuses to create a room on an unsupported size', async () => {
    const supabase = createFakeSupabase()

    await expect(
      createOnlineRoom(supabase.client, 'Alice', { rows: 11, cols: 11, winLength: 5 }),
    ).rejects.toMatchObject({ code: 'invalid_board_size' })
    expect(supabase.rpcCalls).toHaveLength(0)
  })

  it('normalises the join code before sending it', async () => {
    const supabase = createFakeSupabase()
    supabase.onRpc('join_online_room', () => makeRoomPayload({ status: 'active' }))

    await joinOnlineRoom(supabase.client, 'abcd-1234', 'Bob')
    expect(supabase.rpcCalls[0].args).toEqual({
      p_join_code: 'ABCD1234',
      p_display_name: 'Bob',
    })
  })

  it('submits the version and the move id', async () => {
    const supabase = createFakeSupabase()
    supabase.onRpc('submit_online_move', () => makeRoomPayload({ version: 7 }))

    await submitOnlineMove(supabase.client, {
      joinCode: 'ABCD1234',
      cellIndex: 4,
      expectedVersion: 6,
      moveId: 'move-1',
    })

    expect(supabase.rpcCalls[0].args).toEqual({
      p_join_code: 'ABCD1234',
      p_cell_index: 4,
      p_expected_version: 6,
      p_move_id: 'move-1',
    })
  })

  it('reads the state, requests a rematch and leaves the room', async () => {
    const supabase = createFakeSupabase()
    supabase.onRpc('get_online_room_state', () => makeRoomPayload())
    supabase.onRpc('request_online_rematch', () => makeRoomPayload({ status: 'active' }))
    supabase.onRpc('leave_online_room', () => ({ left: true }))

    await fetchOnlineRoomState(supabase.client, 'ABCD1234')
    await requestOnlineRematch(supabase.client, 'ABCD1234')
    await leaveOnlineRoom(supabase.client, 'ABCD1234')

    expect(supabase.rpcCalls.map((call) => call.name)).toEqual([
      'get_online_room_state',
      'request_online_rematch',
      'leave_online_room',
    ])
  })

  it('turns a server error into an OnlineError', async () => {
    const supabase = createFakeSupabase()
    supabase.failRpc('join_online_room', 'room_full')

    await expect(joinOnlineRoom(supabase.client, 'ABCD1234', 'Bob')).rejects.toMatchObject({
      code: 'room_full',
    })
  })
})
