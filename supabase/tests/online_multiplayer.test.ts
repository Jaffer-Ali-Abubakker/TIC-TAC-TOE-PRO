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
  it('expires a waiting room when the owner leaves', async () => {
    const created = await createRoom()
    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    const { rows } = await database.query<{ status: string }>(
      `select status from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].status).toBe('expired')
  })

  it('ends an active match without awarding a forfeit win', async () => {
    const created = await createRoom()
    await database.setUser(BOB)
    await rpc(`select public.join_online_room($1, 'Bob')`, [created.room.joinCode])

    await database.setUser(BOB)
    await rpc(`select public.leave_online_room($1)`, [created.room.joinCode])

    const { rows } = await database.query<{ status: string; result: string | null }>(
      `select status, result from public.online_rooms where id = $1`,
      [created.room.id],
    )
    expect(rows[0].status).toBe('finished')
    expect(rows[0].result).toBeNull()
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
