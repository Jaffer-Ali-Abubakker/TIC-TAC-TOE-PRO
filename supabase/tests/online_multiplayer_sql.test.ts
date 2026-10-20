/**
 * @vitest-environment node
 *
 * Executes `supabase/tests/online_multiplayer.sql` - the exact script the
 * user pastes into the Supabase SQL editor - against a local PostgreSQL
 * engine so the script itself is verified, not just the Vitest assertions.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from './harness'

const here = dirname(fileURLToPath(import.meta.url))
const SCRIPT_PATH = resolve(here, 'online_multiplayer.sql')

let database: TestDatabase

beforeAll(async () => {
  database = await createTestDatabase()
}, 120_000)

describe('the SQL editor security script', () => {
  it('runs from start to finish without raising', async () => {
    const script = readFileSync(SCRIPT_PATH, 'utf8')
    await expect(database.exec(script)).resolves.toBeUndefined()
  }, 120_000)

  it('leaves no test data behind', async () => {
    const { rows } = await database.query<{ rooms: number; players: number }>(
      `select
         (select count(*)::int from public.online_rooms) as rooms,
         (select count(*)::int from public.online_room_players) as players`,
    )
    expect(rows[0].rooms).toBe(0)
    expect(rows[0].players).toBe(0)
  })
})
