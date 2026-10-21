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
const MIGRATION_PATH = resolve(here, '../migrations/0001_online_multiplayer.sql')

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

describe('the migration', () => {
  it('is idempotent and can be re-applied to an existing project', async () => {
    // The user re-runs the migration in the SQL editor, so it has to be safe.
    const migration = readFileSync(MIGRATION_PATH, 'utf8')
    await expect(database.exec(migration)).resolves.toBeUndefined()

    const { rows } = await database.query<{ tables: number; functions: number; policies: number }>(
      `select
         (select count(*)::int from pg_tables where schemaname = 'public'
           and tablename in ('online_rooms','online_room_players','online_moves')) as tables,
         (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in (
             'create_online_room','join_online_room','get_online_room_state',
             'submit_online_move','request_online_rematch','leave_online_room',
             'online_purge_expired_rooms')) as functions,
         (select count(*)::int from pg_policies where schemaname = 'public') as policies`,
    )
    expect(rows[0].tables).toBe(3)
    expect(rows[0].functions).toBe(7)
    expect(rows[0].policies).toBe(3)
  }, 120_000)
})
