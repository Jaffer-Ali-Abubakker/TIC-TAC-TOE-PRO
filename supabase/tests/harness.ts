/**
 * A local, in-process PostgreSQL harness built on PGlite.
 *
 * It lets the real migration run against a real PostgreSQL engine so the
 * database functions, the row level security policies and the transaction
 * semantics can be verified without a Supabase project.
 *
 * The shim below provides the small parts of the Supabase platform that the
 * migration depends on:
 *   - the `auth` schema with `auth.users` and `auth.uid()`
 *   - the `authenticated` / `anon` / `service_role` roles
 *   - a way to switch the "current user" by setting the JWT claim GUC
 *
 * The production migration is executed verbatim; only the platform shim is
 * added around it.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const here = dirname(fileURLToPath(import.meta.url))

export const MIGRATION_PATH = resolve(here, '../migrations/0001_online_multiplayer.sql')

/** Platform shim - everything the migration expects from Supabase. */
const SUPABASE_SHIM = `
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid primary key,
  aud text,
  role text,
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    ),
    ''
  )::uuid;
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to authenticated, anon, service_role;
grant usage on schema auth to authenticated, anon, service_role;
`

export interface TestDatabase {
  db: PGlite
  /** Runs raw SQL as the current role. */
  exec: (sql: string) => Promise<void>
  /** Runs a parameterised query as the current role. */
  query: <T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: T[] }>
  /** Switches the authenticated user for subsequent statements. */
  setUser: (userId: string | null) => Promise<void>
  /** Switches the role used for subsequent statements. */
  setRole: (role: 'authenticated' | 'anon' | 'service_role' | 'postgres') => Promise<void>
  /** Creates an auth user so the FK to auth.users is satisfied. */
  createUser: (userId: string) => Promise<void>
  close: () => Promise<void>
}

/** Creates a fresh database with the shim and the migration applied. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const db = await PGlite.create()

  await db.exec(SUPABASE_SHIM)

  const migration = readFileSync(MIGRATION_PATH, 'utf8')
  await db.exec(migration)

  const api: TestDatabase = {
    db,
    exec: async (sql: string) => {
      await db.exec(sql)
    },
    query: async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => {
      const result = await db.query<T>(sql, params as never[])
      return { rows: result.rows }
    },
    setUser: async (userId: string | null) => {
      if (userId === null) {
        await db.exec(`select set_config('request.jwt.claim.sub', '', false)`)
        return
      }
      await db.exec(`select set_config('request.jwt.claim.sub', '${userId}', false)`)
    },
    setRole: async (role) => {
      await db.exec(`set role ${role}`)
    },
    createUser: async (userId: string) => {
      await db.exec(
        `insert into auth.users (
           instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, created_at, updated_at,
           raw_app_meta_data, raw_user_meta_data
         ) values (
           '00000000-0000-0000-0000-000000000000', '${userId}', 'authenticated', 'authenticated',
           '${userId}@example.test', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
           now(), now(), now(), '{}'::jsonb, '{}'::jsonb
         )
         on conflict (id) do nothing`,
      )
    },
    close: async () => {
      await db.close()
    },
  }

  return api
}

/** Error message of a failed RPC call, e.g. `online:room_not_found`. */
export async function expectRpcError(
  database: TestDatabase,
  sql: string,
  params: unknown[] = [],
): Promise<string> {
  try {
    await database.query(sql, params)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const match = message.match(/online:[a-z_]+/)
    return match ? match[0] : message
  }
  throw new Error('Expected the statement to fail but it succeeded.')
}
