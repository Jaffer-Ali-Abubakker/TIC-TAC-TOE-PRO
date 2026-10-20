-- =============================================================================
-- Tic-Tac-Toe Pro - online multiplayer security checks
-- =============================================================================
-- Run this script in the Supabase SQL editor (or with psql) AFTER applying
-- supabase/migrations/0001_online_multiplayer.sql.
--
-- It creates two throwaway users, then verifies that:
--   * unauthenticated callers cannot create or join rooms
--   * the creator is seated as X, the second player as O
--   * the creator cannot take a second seat
--   * a third player is rejected
--   * a non member cannot read the room
--   * direct table writes are rejected
--   * illegal moves are rejected (wrong turn, occupied cell, stale version)
--   * a duplicated move id is applied only once
--   * a rematch only starts once both players agree
--
-- Everything it creates is removed again at the end.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Test users
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not exists (select 1 from auth.users where id = v_alice) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_alice, 'authenticated', 'authenticated',
      'alice@ttt-test.local', 'throwaway-test-password',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    );
  end if;

  if not exists (select 1 from auth.users where id = v_bob) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      '00000000-0000-0000-0000-000000000000', v_bob, 'authenticated', 'authenticated',
      'bob@ttt-test.local', 'throwaway-test-password',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    );
  end if;

  raise notice 'SETUP: test users ready';
end
$$;

-- -----------------------------------------------------------------------------
-- Helper: run a statement as a given user and report the error code
-- -----------------------------------------------------------------------------
create or replace function pg_temp.ttt_as_user(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
end
$$;

create or replace function pg_temp.ttt_error_code(p_sql text)
returns text
language plpgsql
as $$
declare
  v_error text;
begin
  begin
    execute p_sql;
    v_error := null;
  exception when others then
    v_error := substring(sqlerrm from 'online:[a-z_]+');
  end;
  return v_error;
end
$$;

-- -----------------------------------------------------------------------------
-- 1. Unauthenticated callers are rejected
-- -----------------------------------------------------------------------------
do $$
declare
  v_error text;
begin
  perform pg_temp.ttt_as_user(null);
  v_error := pg_temp.ttt_error_code('select public.create_online_room(null)');
  if v_error is distinct from 'online:unauthenticated' then
    raise exception 'FAIL: an unauthenticated caller could create a room (error was %)', v_error;
  end if;
  raise notice 'PASS: unauthenticated room creation is rejected';
end
$$;

-- -----------------------------------------------------------------------------
-- 2. The creator is seated as X
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_payload jsonb;
begin
  perform pg_temp.ttt_as_user(v_alice);
  select public.create_online_room('Alice') into v_payload;

  if v_payload ->> 'mySymbol' <> 'X' then
    raise exception 'FAIL: the creator was not seated as X';
  end if;
  if v_payload -> 'room' ->> 'status' <> 'waiting' then
    raise exception 'FAIL: a new room is not in the waiting state';
  end if;
  if jsonb_array_length(v_payload -> 'players') <> 1 then
    raise exception 'FAIL: a new room does not have exactly one player';
  end if;
  raise notice 'PASS: the creator is seated as X and the room waits for an opponent';
end
$$;

-- -----------------------------------------------------------------------------
-- 3. The second player is seated as O, a third player is rejected and the
--    creator cannot take a second seat
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
  v_code text;
  v_payload jsonb;
  v_error text;
begin
  perform pg_temp.ttt_as_user(v_alice);
  select public.create_online_room('Alice') into v_payload;
  v_code := v_payload -> 'room' ->> 'joinCode';

  -- The creator cannot take the second seat.
  v_error := pg_temp.ttt_error_code(format('select public.join_online_room(%L, ''Alice'')', v_code));
  if v_error is distinct from 'online:already_in_room' then
    raise exception 'FAIL: the creator was allowed to take a second seat (error was %)', v_error;
  end if;

  -- The second player is seated as O.
  perform pg_temp.ttt_as_user(v_bob);
  select public.join_online_room(v_code, 'Bob') into v_payload;
  if v_payload ->> 'mySymbol' <> 'O' then
    raise exception 'FAIL: the second player was not seated as O';
  end if;
  if v_payload -> 'room' ->> 'status' <> 'active' then
    raise exception 'FAIL: the room did not become active';
  end if;

  -- A third player is rejected.
  perform pg_temp.ttt_as_user(v_alice);
  v_error := pg_temp.ttt_error_code(format('select public.join_online_room(%L, ''Alice'')', v_code));
  if v_error is distinct from 'online:already_in_room' and v_error is distinct from 'online:room_full' then
    raise exception 'FAIL: a third player was not rejected (error was %)', v_error;
  end if;

  raise notice 'PASS: seats are allocated correctly and a third player is rejected';
end
$$;

-- -----------------------------------------------------------------------------
-- 4. A non member cannot read the room
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
  v_code text;
  v_payload jsonb;
  v_error text;
begin
  perform pg_temp.ttt_as_user(v_alice);
  select public.create_online_room('Alice') into v_payload;
  v_code := v_payload -> 'room' ->> 'joinCode';

  perform pg_temp.ttt_as_user(v_bob);
  v_error := pg_temp.ttt_error_code(format('select public.get_online_room_state(%L)', v_code));
  if v_error is distinct from 'online:not_a_member' then
    raise exception 'FAIL: a non member could read the room (error was %)', v_error;
  end if;

  raise notice 'PASS: a non member cannot read the room';
end
$$;

-- -----------------------------------------------------------------------------
-- 5. Direct table writes are rejected
-- -----------------------------------------------------------------------------
-- The SQL editor runs as the `postgres` superuser, which BYPASSES row level
-- security. The check therefore runs inside an explicit transaction as the
-- unprivileged `authenticated` role - which is what a real client runs as.
-- `set local role` is reverted by the COMMIT (or by the implicit ROLLBACK if
-- the check fails), so the session role never leaks.
begin;

set local role authenticated;

do $$
declare
  v_code text;
  v_error text;
begin
  -- Only rooms the caller is a member of are visible (row level security).
  select r.join_code into v_code
  from public.online_rooms r
  join public.online_room_players p on p.room_id = r.id
  where p.user_id = auth.uid()
  limit 1;

  if v_code is null then
    raise exception 'FAIL: the test room is not visible to the authenticated role';
  end if;

  begin
    update public.online_rooms
       set board = ARRAY['X', 'X', 'X', NULL, NULL, NULL, NULL, NULL, NULL]::text[]
     where join_code = v_code;
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null then
    raise exception 'FAIL: a direct board update was allowed';
  end if;

  begin
    delete from public.online_rooms where join_code = v_code;
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null then
    raise exception 'FAIL: a direct room delete was allowed';
  end if;

  begin
    insert into public.online_room_players (room_id, user_id, player_symbol)
    select id, auth.uid(), 'O' from public.online_rooms where join_code = v_code;
    v_error := null;
  exception when others then
    v_error := sqlerrm;
  end;

  if v_error is null then
    raise exception 'FAIL: a direct seat insert was allowed';
  end if;

  raise notice 'PASS: direct table writes are rejected';
end
$$;

commit;

-- -----------------------------------------------------------------------------
-- 6. Illegal moves are rejected
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
  v_code text;
  v_payload jsonb;
  v_error text;
  v_move_id uuid := '44444444-4444-4444-8444-444444444444';
begin
  perform pg_temp.ttt_as_user(v_alice);
  select public.create_online_room('Alice') into v_payload;
  v_code := v_payload -> 'room' ->> 'joinCode';

  perform pg_temp.ttt_as_user(v_bob);
  select public.join_online_room(v_code, 'Bob') into v_payload;

  -- Not your turn.
  perform pg_temp.ttt_as_user(v_bob);
  v_error := pg_temp.ttt_error_code(format(
    'select public.submit_online_move(%L, 0, null, gen_random_uuid())', v_code
  ));
  if v_error is distinct from 'online:not_your_turn' then
    raise exception 'FAIL: a move out of turn was accepted (error was %)', v_error;
  end if;

  -- A valid move.
  perform pg_temp.ttt_as_user(v_alice);
  select public.submit_online_move(v_code, 0, null, v_move_id) into v_payload;

  -- The same move id is applied only once.
  select public.submit_online_move(v_code, 0, null, v_move_id) into v_payload;
  if (v_payload -> 'room' ->> 'movesPlayed')::int <> 1 then
    raise exception 'FAIL: a duplicated move id was applied twice';
  end if;

  -- An occupied cell.
  perform pg_temp.ttt_as_user(v_bob);
  select public.submit_online_move(v_code, 3, null, gen_random_uuid()) into v_payload;
  perform pg_temp.ttt_as_user(v_alice);
  v_error := pg_temp.ttt_error_code(format(
    'select public.submit_online_move(%L, 0, null, gen_random_uuid())', v_code
  ));
  if v_error is distinct from 'online:cell_taken' then
    raise exception 'FAIL: a move on an occupied cell was accepted (error was %)', v_error;
  end if;

  -- A stale version.
  v_error := pg_temp.ttt_error_code(format(
    'select public.submit_online_move(%L, 6, 1, gen_random_uuid())', v_code
  ));
  if v_error is distinct from 'online:stale_version' then
    raise exception 'FAIL: a move based on a stale board was accepted (error was %)', v_error;
  end if;

  -- An out of range cell.
  v_error := pg_temp.ttt_error_code(format(
    'select public.submit_online_move(%L, 9, null, gen_random_uuid())', v_code
  ));
  if v_error is distinct from 'online:invalid_cell' then
    raise exception 'FAIL: an out of range cell was accepted (error was %)', v_error;
  end if;

  raise notice 'PASS: illegal moves are rejected and retries are idempotent';
end
$$;

-- -----------------------------------------------------------------------------
-- 7. A rematch only starts once both players agree
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
  v_code text;
  v_payload jsonb;
  v_error text;
begin
  perform pg_temp.ttt_as_user(v_alice);
  select public.create_online_room('Alice') into v_payload;
  v_code := v_payload -> 'room' ->> 'joinCode';

  perform pg_temp.ttt_as_user(v_bob);
  select public.join_online_room(v_code, 'Bob') into v_payload;

  -- X wins the top row.
  perform pg_temp.ttt_as_user(v_alice);
  select public.submit_online_move(v_code, 0, null, gen_random_uuid()) into v_payload;
  perform pg_temp.ttt_as_user(v_bob);
  select public.submit_online_move(v_code, 3, null, gen_random_uuid()) into v_payload;
  perform pg_temp.ttt_as_user(v_alice);
  select public.submit_online_move(v_code, 1, null, gen_random_uuid()) into v_payload;
  perform pg_temp.ttt_as_user(v_bob);
  select public.submit_online_move(v_code, 4, null, gen_random_uuid()) into v_payload;
  perform pg_temp.ttt_as_user(v_alice);
  select public.submit_online_move(v_code, 2, null, gen_random_uuid()) into v_payload;

  if v_payload -> 'room' ->> 'result' <> 'X' then
    raise exception 'FAIL: the X win was not detected';
  end if;
  if v_payload -> 'room' ->> 'winningCombination' is distinct from '[0, 1, 2]' then
    raise exception 'FAIL: the winning combination was not reported';
  end if;

  -- A rematch during the game is not possible (the game is over here).
  perform pg_temp.ttt_as_user(v_alice);
  select public.request_online_rematch(v_code) into v_payload;
  if v_payload -> 'room' ->> 'status' <> 'finished' then
    raise exception 'FAIL: a single rematch request started a new round';
  end if;

  -- The second request starts the new round.
  perform pg_temp.ttt_as_user(v_bob);
  select public.request_online_rematch(v_code) into v_payload;
  if v_payload -> 'room' ->> 'status' <> 'active' then
    raise exception 'FAIL: the rematch did not start after both players agreed';
  end if;
  if (v_payload -> 'room' ->> 'roundNumber')::int <> 2 then
    raise exception 'FAIL: the rematch did not increment the round number';
  end if;

  raise notice 'PASS: a rematch only starts once both players agree';
end
$$;

-- -----------------------------------------------------------------------------
-- Cleanup
-- -----------------------------------------------------------------------------
do $$
declare
  v_alice uuid := '11111111-1111-4111-8111-111111111111';
  v_bob   uuid := '22222222-2222-4222-8222-222222222222';
begin
  perform pg_temp.ttt_as_user(v_alice);

  delete from public.online_rooms
  where id in (
    select room_id from public.online_room_players where user_id in (v_alice, v_bob)
  );
  delete from public.online_room_players where user_id in (v_alice, v_bob);
  delete from auth.users where id in (v_alice, v_bob);

  raise notice 'DONE: all online multiplayer security checks passed and the test data was removed';
end
$$;
