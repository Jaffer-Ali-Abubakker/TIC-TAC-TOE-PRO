/**
 * @vitest-environment node
 *
 * Database security and integration tests.
 *
 * These run the REAL migration against a real PostgreSQL engine (PGlite) with
 * a small Supabase platform shim, so the RPC functions, the row level
 * security policies and the transaction semantics are genuinely exercised -
 * not mocked.
 *
 * The same assertions are also available for a hosted Supabase project:
 *   supabase test db
 * or by pasting `supabase/tests/online_multiplayer.sql` into the SQL editor.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDatabase, expectRpcError, type TestDatabase } from './harness'

const ALICE = '11111111-1111-4111-8111-111111111111'
const BOB = '22222222-2222-4222-8222-222222222222'
const CAROL = '33333333-3333-4333-8333-333333333333'

let database: TestDatabase

interface RoomPayload {
  room: {
    id: string
    joinCode: string
    status: string
    rows: number
    cols: number
    winLength: number
    board: (string | null)[]
    currentTurn: string
    winnerSymbol: string | null
    result: string | null
    winningCombination: number[] | null
    version: number
    roundNumber: number
    lastMoveIndex: number | null
    movesPlayed: number
  }
  players: Array<{
    userId: string
    symbol: string
    displayName: string | null
    isOwner: boolean
    rematchRequested: boolean
  }>
  mySymbol: string | null
}

async function rpc(sql: string, params: unknown[] = []): Promise<RoomPayload> {
  const { rows } = await database.query<Record<string, unknown>>(sql, params)
  const row = rows[0]
  if (!row) throw new Error(`The statement returned no rows: ${sql}`)
  const values = Object.values(row)
  return values[0] as RoomPayload
}

async function createRoom(owner = ALICE): Promise<RoomPayload> {
  const payload = await rpc(`select public.create_online_room('Alice')`)
  expect(payload.room.joinCode).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/)
  expect(payload.mySymbol).toBe('X')
  expect(payload.room.status).toBe('waiting')
  expect(payload.room.board).toHaveLength(9)
  expect(payload.room.board.every((cell) => cell === null)).toBe(true)
  expect(payload.room.currentTurn).toBe('X')
  expect(payload.players).toHaveLength(1)
  expect(owner).toBe(ALICE)
  return payload
}

beforeAll(async () => {
  database = await createTestDatabase()
  await database.createUser(ALICE)
  await database.createUser(BOB)
  await database.createUser(CAROL)
}, 120_000)

afterAll(async () => {
  await database?.close()
})

beforeEach(async () => {
  await database.exec('reset role')
  await database.setUser(ALICE)
  await database.exec(`delete from public.online_moves`)
  await database.exec(`delete from public.online_room_players`)
  await database.exec(`delete from public.online_rooms`)
  await database.setUser(ALICE)
})

describe('room creation', () => {
  it('lets an authenticated user create a room and assigns them X', async () => {
    const payload = await createRoom()
    expect(payload.room.status).toBe('waiting')
    expect(payload.room.currentTurn).toBe('X')
    expect(payload.mySymbol).toBe('X')
    expect(payload.players[0].symbol).toBe('X')
    expect(payload.players[0].isOwner).toBe(true)
    expect(payload.players[0].displayName).toBe('Alice')
  })

  it('generates a different, unpredictable code for every room', async () => {
    const codes = new Set<string>()
    for (let index = 0; index < 12; index += 1) {
      const payload = await rpc(`select public.create_online_room(null)`)
      codes.add(payload.room.joinCode)
    }
    expect(codes.size).toBe(12)
  })

  it('rejects unauthenticated callers', async () => {
    await database.setUser(null)
    const error = await expectRpcError(database, `select public.create_online_room(null)`)
    expect(error).toBe('online:unauthenticated')
  })
})

describe('board size', () => {
  /** Creates a room of the given shape with both seats taken. */
  async function sizedRoom(rows: number, cols: number): Promise<RoomPayload> {
    const created = await rpc(`select public.create_online_room('Alice', $1, $2)`, [rows, cols])
    await database.setUser(BOB)
    const joined = await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)
    return joined
  }

  it('stores the chosen geometry and derives the win length', async () => {
    const payload = await rpc(`select public.create_online_room('Alice', 6, 6)`)
    expect(payload.room.rows).toBe(6)
    expect(payload.room.cols).toBe(6)
    expect(payload.room.winLength).toBe(4)
    expect(payload.room.board).toHaveLength(36)
    expect(payload.room.board.every((cell) => cell === null)).toBe(true)
  })

  it('derives three, four or five in a row from the shape', async () => {
    const expected: Array<[number, number, number]> = [
      [3, 3, 3],
      [3, 5, 4],
      [4, 4, 4],
      [7, 7, 4],
      [8, 8, 5],
      [10, 10, 5],
    ]
    for (const [rows, cols, winLength] of expected) {
      const payload = await rpc(`select public.create_online_room(null, $1, $2)`, [rows, cols])
      expect(payload.room.winLength).toBe(winLength)
      expect(payload.room.board).toHaveLength(rows * cols)
    }
  })

  it('keeps 3x3 as the default, so old style rooms still work', async () => {
    const payload = await rpc(`select public.create_online_room('Alice')`)
    expect(payload.room.rows).toBe(3)
    expect(payload.room.cols).toBe(3)
    expect(payload.room.winLength).toBe(3)
  })

  it('rejects a size outside the limits', async () => {
    const sizes: Array<[number, number]> = [
      [2, 3],
      [3, 2],
      [11, 3],
      [3, 11],
      [10, 11],
    ]
    for (const [rows, cols] of sizes) {
      const error = await expectRpcError(
        database,
        `select public.create_online_room(null, $1, $2)`,
        [rows, cols],
      )
      expect(error).toBe('online:invalid_board_size')
    }
  })

  it('accepts a cell anywhere on a 10x10 board and rejects one past the end', async () => {
    const room = await sizedRoom(10, 10)
    await database.setUser(ALICE)
    const state = await rpc(`select public.submit_online_move($1, 99, null, gen_random_uuid())`, [
      room.room.joinCode,
    ])
    expect(state.room.board[99]).toBe('X')
    expect(state.room.lastMoveIndex).toBe(99)

    await database.setUser(BOB)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 100, null, gen_random_uuid())`,
      [room.room.joinCode],
    )
    expect(error).toBe('online:invalid_cell')
  })

  it('needs four in a row to win on a 6x6 board', async () => {
    const room = await sizedRoom(6, 6)
    const code = room.room.joinCode

    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 6, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 1, null, gen_random_uuid())`, [code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 7, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    const three = await rpc(`select public.submit_online_move($1, 2, null, gen_random_uuid())`, [code])
    expect(three.room.status).toBe('active')
    expect(three.room.result).toBeNull()

    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 8, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    const four = await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [code])

    expect(four.room.status).toBe('finished')
    expect(four.room.result).toBe('X')
    expect(four.room.winningCombination).toEqual([0, 1, 2, 3])
  })

  it('starts a rematch on the same geometry', async () => {
    const room = await sizedRoom(6, 6)
    const code = room.room.joinCode

    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 6, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 1, null, gen_random_uuid())`, [code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 7, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 2, null, gen_random_uuid())`, [code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 8, null, gen_random_uuid())`, [code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [code])

    await rpc(`select public.request_online_rematch($1)`, [code])
    await database.setUser(BOB)
    const rematch = await rpc(`select public.request_online_rematch($1)`, [code])

    expect(rematch.room.status).toBe('active')
    expect(rematch.room.roundNumber).toBe(2)
    expect(rematch.room.rows).toBe(6)
    expect(rematch.room.cols).toBe(6)
    expect(rematch.room.winLength).toBe(4)
    expect(rematch.room.board).toHaveLength(36)
    expect(rematch.room.board.every((cell) => cell === null)).toBe(true)
  })
})

describe('joining a room', () => {
  it('assigns O to a second, distinct user and activates the room', async () => {
    const created = await createRoom()

    await database.setUser(BOB)
    const joined = await rpc(
      `select public.join_online_room($1, 'Bob')`,
      [created.room.joinCode],
    )

    expect(joined.mySymbol).toBe('O')
    expect(joined.room.status).toBe('active')
    expect(joined.room.currentTurn).toBe('X')
    expect(joined.players).toHaveLength(2)
    expect(joined.players.map((player) => player.symbol).sort()).toEqual(['O', 'X'])
  })

  it('rejects a third player', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await database.setUser(CAROL)
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Carl')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:room_full')
  })

  it('rejects the creator taking a second seat', async () => {
    const created = await createRoom()
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Alice')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:already_in_room')

    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_room_players where room_id = $1`,
      [created.room.id],
    )
    expect(rows[0].count).toBe(1)
  })

  it('rejects unknown, malformed and expired rooms', async () => {
    const unknown = await expectRpcError(database, `select public.join_online_room('ZZZZZZZZ', null)`)
    expect(unknown).toBe('online:room_not_found')

    const malformed = await expectRpcError(database, `select public.join_online_room('not a code!', null)`)
    expect(malformed).toBe('online:invalid_code')

    const created = await createRoom()
    await database.exec(
      `update public.online_rooms set expires_at = now() - interval '1 minute' where id = '${created.room.id}'`,
    )
    await database.setUser(BOB)
    const expired = await expectRpcError(database, `select public.join_online_room($1, 'Bob')`, [
      created.room.joinCode,
    ])
    expect(expired).toBe('online:room_expired')
  })

  it('rejects unauthenticated callers', async () => {
    const created = await createRoom()
    await database.setUser(null)
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Bob')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:unauthenticated')
  })
})

describe('reading room state', () => {
  it('lets a member read the room', async () => {
    const created = await createRoom()
    const state = await rpc(`select public.get_online_room_state($1)`, [created.room.joinCode])
    expect(state.room.id).toBe(created.room.id)
    expect(state.mySymbol).toBe('X')
  })

  it('refuses a non member', async () => {
    const created = await createRoom()
    await database.setUser(CAROL)
    const error = await expectRpcError(database, `select public.get_online_room_state($1)`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:not_a_member')
  })

  it('does not leak other rooms through row level security', async () => {
    const created = await createRoom()
    await database.setUser(CAROL)
    await database.setRole('authenticated')

    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_rooms`,
    )
    expect(rows[0].count).toBe(0)

    const memberRows = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(memberRows.rows[0].count).toBe(0)
  })

  it('lets a member read their own room through the table', async () => {
    await createRoom()
    await database.setRole('authenticated')
    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_rooms`,
    )
    expect(rows[0].count).toBe(1)
  })
})

describe('direct table writes', () => {
  it('rejects a direct board update', async () => {
    const created = await createRoom()
    await database.setRole('authenticated')

    await expect(
      database.exec(
        `update public.online_rooms set board = ARRAY['X','X','X',NULL,NULL,NULL,NULL,NULL,NULL]::text[] where id = '${created.room.id}'`,
      ),
    ).rejects.toThrow()

    await database.exec('reset role')
    const { rows } = await database.query<{ board: (string | null)[] }>(
      `select board from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].board.every((cell) => cell === null)).toBe(true)
  })

  it('rejects a direct insert of a player row', async () => {
    const created = await createRoom()
    await database.setRole('authenticated')

    await expect(
      database.exec(
        `insert into public.online_room_players (room_id, user_id, player_symbol) values ('${created.room.id}', '${BOB}', 'O')`,
      ),
    ).rejects.toThrow()
  })
  it('rejects a direct insert of a room row', async () => {
    await database.setRole('authenticated')
    await expect(
      database.exec(
        `insert into public.online_rooms (join_code, board) values ('TESTCODE', ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[])`,
      ),
    ).rejects.toThrow()
  })

  it('rejects a direct delete of a room', async () => {
    const created = await createRoom()
    await database.setRole('authenticated')
    await expect(
      database.exec(`delete from public.online_rooms where id = '${created.room.id}'`),
    ).rejects.toThrow()
  })
})

describe('submitting moves', () => {
  async function twoPlayerRoom(): Promise<{ code: string; id: string; version: number }> {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)
    const state = await rpc(`select public.get_online_room_state($1)`, [created.room.joinCode])
    return { code: created.room.joinCode, id: created.room.id, version: state.room.version }
  }

  it('applies a legal move and switches the turn', async () => {
    const room = await twoPlayerRoom()
    const state = await rpc(
      `select public.submit_online_move($1, 0, $2, gen_random_uuid())`,
      [room.code, room.version],
    )
    expect(state.room.board[0]).toBe('X')
    expect(state.room.currentTurn).toBe('O')
    expect(state.room.movesPlayed).toBe(1)
    expect(state.room.version).toBeGreaterThan(room.version)
    expect(state.room.lastMoveIndex).toBe(0)
  })

  it('rejects a move by a non member', async () => {
    const room = await twoPlayerRoom()
    await database.setUser(CAROL)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, 1, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:not_a_member')
  })

  it('rejects a move when it is not the players turn', async () => {
    const room = await twoPlayerRoom()
    await database.setUser(BOB)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, 1, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:not_your_turn')
  })

  it('rejects a move on an occupied cell', async () => {
    const room = await twoPlayerRoom()
    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, null, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:cell_taken')
  })

  it('rejects an out of range cell', async () => {
    const room = await twoPlayerRoom()
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 9, null, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:invalid_cell')

    const negative = await expectRpcError(
      database,
      `select public.submit_online_move($1, -1, null, gen_random_uuid())`,
      [room.code],
    )
    expect(negative).toBe('online:invalid_cell')
  })

  it('rejects a move based on a stale board version', async () => {
    const room = await twoPlayerRoom()
    const first = await rpc(`select public.submit_online_move($1, 0, $2, gen_random_uuid())`, [
      room.code,
      room.version,
    ])
    const staleVersion = first.room.version

    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)

    // The client still believes the board is at the old version.
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 6, $2, gen_random_uuid())`,
      [room.code, staleVersion],
    )
    expect(error).toBe('online:stale_version')
  })

  it('is idempotent for a repeated move id', async () => {
    const room = await twoPlayerRoom()
    const moveId = '44444444-4444-4444-8444-444444444444'

    const first = await rpc(`select public.submit_online_move($1, 0, null, $2)`, [room.code, moveId])
    const second = await rpc(`select public.submit_online_move($1, 0, null, $2)`, [room.code, moveId])

    expect(second.room.version).toBe(first.room.version)
    expect(second.room.movesPlayed).toBe(1)

    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_moves where room_id = $1`,
      [room.id],
    )
    expect(rows[0].count).toBe(1)
  })

  it('rejects unauthenticated callers', async () => {
    const room = await twoPlayerRoom()
    await database.setUser(null)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, null, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:unauthenticated')
  })

  it('detects an X win on the top row', async () => {
    const room = await twoPlayerRoom()
    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 1, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 4, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)
    const state = await rpc(`select public.submit_online_move($1, 2, null, gen_random_uuid())`, [
      room.code,
    ])

    expect(state.room.status).toBe('finished')
    expect(state.room.result).toBe('X')
    expect(state.room.winnerSymbol).toBe('X')
    expect(state.room.winningCombination).toEqual([0, 1, 2])
  })

  it('detects an O win on a diagonal', async () => {
    const room = await twoPlayerRoom()
    // X: 0, 3   O: 4, 8  ->  X at 6 completes the 2-4-6 diagonal for O? no.
    // Build an O win on 2-4-6: O takes 4, 2, 6 while X takes 0, 3, 5.
    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 4, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 2, null, gen_random_uuid())`, [room.code])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 5, null, gen_random_uuid())`, [room.code])
    await database.setUser(BOB)
    const state = await rpc(`select public.submit_online_move($1, 6, null, gen_random_uuid())`, [
      room.code,
    ])

    expect(state.room.status).toBe('finished')
    expect(state.room.result).toBe('O')
    expect(state.room.winningCombination).toEqual([2, 4, 6])
  })

  it('detects a draw and refuses further moves', async () => {
    const room = await twoPlayerRoom()
    // X O X / X O O / O X X  ->  full board, no line
    const order: Array<[number, string]> = [
      [0, ALICE],
      [1, BOB],
      [2, ALICE],
      [4, BOB],
      [3, ALICE],
      [5, BOB],
      [7, ALICE],
      [6, BOB],
      [8, ALICE],
    ]

    let last: RoomPayload | null = null
    for (const [index, user] of order) {
      await database.setUser(user)
      last = await rpc(`select public.submit_online_move($1, $2, null, gen_random_uuid())`, [
        room.code,
        index,
      ])
    }

    expect(last?.room.status).toBe('finished')
    expect(last?.room.result).toBe('draw')
    expect(last?.room.winnerSymbol).toBeNull()

    await database.setUser(ALICE)
    const error = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, null, gen_random_uuid())`,
      [room.code],
    )
    expect(error).toBe('online:game_not_active')
  })
})

describe('rematch', () => {
  async function finishedRoom(): Promise<string> {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 3, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 1, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])
    await database.setUser(BOB)
    await rpc(`select public.submit_online_move($1, 4, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 2, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])
    return created.room.joinCode
  }

  it('does not start a new round until both players agree', async () => {
    const code = await finishedRoom()

    const afterFirst = await rpc(`select public.request_online_rematch($1)`, [code])
    expect(afterFirst.room.status).toBe('finished')
    expect(afterFirst.room.roundNumber).toBe(1)
    expect(afterFirst.players.filter((player) => player.rematchRequested)).toHaveLength(1)

    await database.setUser(BOB)
    const afterSecond = await rpc(`select public.request_online_rematch($1)`, [code])
    expect(afterSecond.room.status).toBe('active')
    expect(afterSecond.room.roundNumber).toBe(2)
    expect(afterSecond.room.board.every((cell) => cell === null)).toBe(true)
    expect(afterSecond.room.currentTurn).toBe('X')
    expect(afterSecond.room.result).toBeNull()
    expect(afterSecond.room.winningCombination).toBeNull()
  })

  it('alternates the X symbol for the next round', async () => {
    const code = await finishedRoom()
    await rpc(`select public.request_online_rematch($1)`, [code])
    await database.setUser(BOB)
    const state = await rpc(`select public.request_online_rematch($1)`, [code])

    const alice = state.players.find((player) => player.userId === ALICE)
    const bob = state.players.find((player) => player.userId === BOB)
    expect(alice?.symbol).toBe('O')
    expect(bob?.symbol).toBe('X')
  })

  it('refuses a rematch while the game is still running', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)
    const error = await expectRpcError(database, `select public.request_online_rematch($1)`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:game_not_finished')
  })

  it('refuses a rematch for a non member', async () => {
    const code = await finishedRoom()
    await database.setUser(CAROL)
    const error = await expectRpcError(database, `select public.request_online_rematch($1)`, [code])
    expect(error).toBe('online:not_a_member')
  })
})

describe('leaving a room', () => {
  it('closes the room when the host leaves', async () => {
    const created = await createRoom()
    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    const { rows } = await database.query<{ status: string }>(
      `select status from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].status).toBe('closed')

    // The invite link is dead: nobody can join that code any more.
    await database.setUser(BOB)
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Bob')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:room_closed')
  })

  it('sends the guest back to the waiting room when they leave', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    const { rows } = await database.query<{
      status: string
      result: string | null
      moves_played: number
      seats: number
    }>(
      `select status, result, moves_played,
              (select count(*) from public.online_room_players p where p.room_id = r.id) as seats
         from public.online_rooms r where r.id = $1`,
      [created.room.id],
    )
    // The host keeps the room, its code and their seat.
    expect(rows[0].status).toBe('waiting')
    expect(rows[0].seats).toBe(1)
    expect(rows[0].result).toBeNull()
    expect(rows[0].moves_played).toBe(0)

    // A new opponent can take the freed seat with the same code.
    await database.setUser(CAROL)
    const joined = await rpc(`select public.join_online_room($1, 'Carol')`, [created.room.joinCode])
    expect(joined.room.status).toBe('active')
    expect(joined.players).toHaveLength(2)
  })

  it('closes the room when the host leaves an active match', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await database.setUser(ALICE)
    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    const { rows } = await database.query<{ status: string; result: string | null }>(
      `select status, result from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].status).toBe('closed')
    expect(rows[0].result).toBeNull()

    // The guest can still read the snapshot (that is how it learns the host
    // left) but can no longer play.
    await database.setUser(BOB)
    const state = await rpc(`select public.get_online_room_state($1)`, [created.room.joinCode])
    expect(state.room.status).toBe('closed')

    const moveError = await expectRpcError(
      database,
      `select public.submit_online_move($1, 0, $2, gen_random_uuid())`,
      [created.room.joinCode, state.room.version],
    )
    expect(moveError).toBe('online:game_not_active')
  })

  it('refuses a leave from a non member', async () => {
    const created = await createRoom()
    await database.setUser(CAROL)
    const error = await expectRpcError(database, `select public.leave_online_room($1)`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:not_a_member')
  })
})

describe('room permissions', () => {
  it('marks the creator as the only owner', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    const joined = await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    const owners = joined.players.filter((player) => player.isOwner)
    expect(owners).toHaveLength(1)
    expect(owners[0].userId).toBe(ALICE)
    expect(joined.mySymbol).toBe('O')
  })

  it('turns a third visitor away as room full', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await database.setUser(CAROL)
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Carol')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:room_full')
  })

  it('keeps the already joined guest seated when they re-open the link', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    // Re-opening the invite link is `already_in_room`, not a second seat and
    // never a promotion to host.
    const error = await expectRpcError(database, `select public.join_online_room($1, 'Bob')`, [
      created.room.joinCode,
    ])
    expect(error).toBe('online:already_in_room')

    const state = await rpc(`select public.get_online_room_state($1)`, [created.room.joinCode])
    expect(state.mySymbol).toBe('O')
    expect(state.players.find((player: { isOwner: boolean }) => player.isOwner)?.userId).toBe(ALICE)
  })

  it('does not lock a guest out after the host closes the room', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)
    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    await database.setUser(BOB)
    const own = await rpc(`select public.create_online_room('Bob')`)
    expect(own.mySymbol).toBe('X')
    expect(own.players[0].isOwner).toBe(true)
  })
})

describe('function privileges', () => {
  it('does not let anon or authenticated call the payload builder directly', async () => {
    // online_room_payload is SECURITY DEFINER and takes an arbitrary user id.
    // If it were callable from the API a client could bypass RLS and read any
    // room by passing its id.
    const { rows } = await database.query<{ anon: boolean; authenticated: boolean }>(
      `select
         has_function_privilege('anon', 'public.online_room_payload(uuid,uuid)', 'execute') as anon,
         has_function_privilege('authenticated', 'public.online_room_payload(uuid,uuid)', 'execute') as authenticated`,
    )
    expect(rows[0].anon).toBe(false)
    expect(rows[0].authenticated).toBe(false)
  })

  it('does not let anon call any of the game functions', async () => {
    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in (
            'create_online_room','join_online_room','get_online_room_state',
            'submit_online_move','request_online_rematch','leave_online_room')
          and has_function_privilege('anon', p.oid, 'execute')`,
    )
    expect(rows[0].count).toBe(0)
  })

  it('does not let authenticated call the operational cleanup functions', async () => {
    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('online_expire_rooms','online_purge_expired_rooms')
          and (has_function_privilege('anon', p.oid, 'execute')
               or has_function_privilege('authenticated', p.oid, 'execute'))`,
    )
    expect(rows[0].count).toBe(0)
  })

  it('still lets a member read their own room through the table', async () => {
    const created = await createRoom()
    await database.setRole('authenticated')
    const { rows } = await database.query<{ count: number }>(
      `select count(*)::int as count from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].count).toBe(1)
  })
})

describe('expiry sweep', () => {
  it('marks abandoned rooms as expired and is safe to rerun', async () => {
    const created = await createRoom()
    await database.exec(
      `update public.online_rooms set expires_at = now() - interval '1 minute' where id = '${created.room.id}'`,
    )

    const { rows } = await database.query<{ expired: number }>(
      `select public.online_expire_rooms() as expired`,
    )
    expect(rows[0].expired).toBeGreaterThanOrEqual(1)

    const { rows: again } = await database.query<{ expired: number }>(
      `select public.online_expire_rooms() as expired`,
    )
    expect(again[0].expired).toBe(0)
  })

  it('purges long expired rooms together with their move log', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)
    await rpc(`select public.submit_online_move($1, 0, null, gen_random_uuid())`, [
      created.room.joinCode,
    ])

    // Mark the room as expired and old enough to be purged.
    await database.exec(
      `update public.online_rooms
          set status = 'expired', expires_at = now() - interval '48 hours'
        where id = '${created.room.id}'`,
    )

    const { rows } = await database.query<{ purged: number }>(
      `select public.online_purge_expired_rooms() as purged`,
    )
    expect(rows[0].purged).toBeGreaterThanOrEqual(1)

    const { rows: left } = await database.query<{ rooms: number; moves: number }>(
      `select
         (select count(*)::int from public.online_rooms where id = $1) as rooms,
         (select count(*)::int from public.online_moves where room_id = $1) as moves`,
      [created.room.id],
    )
    expect(left[0].rooms).toBe(0)
    expect(left[0].moves).toBe(0)
  })

  it('never purges an active match', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])
    await database.setUser(ALICE)

    await database.exec(
      `update public.online_rooms set expires_at = now() - interval '48 hours' where id = '${created.room.id}'`,
    )
    await database.query(`select public.online_purge_expired_rooms()`)

    const { rows } = await database.query<{ status: string }>(
      `select status from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].status).toBe('active')
  })
})
