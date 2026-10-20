-- =============================================================================
-- Tic-Tac-Toe Pro - online multiplayer schema
-- =============================================================================
-- Applies to a fresh Supabase project and is safe to re-run.
--
--   supabase db push                 # applies every pending migration
--   supabase db reset                # drops + replays all migrations locally
--   psql "$DB_URL" -f supabase/migrations/0001_online_multiplayer.sql
--
-- Design rules enforced here:
--   * The DATABASE is the authority. Clients never write board state directly.
--   * Every mutating operation is a SECURITY DEFINER function that derives the
--     player identity from auth.uid() - never from a client supplied value.
--   * Row Level Security makes the base tables unreadable/unwritable for
--     clients, so the functions are the only way in.
--   * All client facing errors use the `online:<code>` vocabulary so the
--     frontend can map them to friendly messages without leaking SQL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

-- A private game room. One row per match room.
create table if not exists public.online_rooms (
  id                  uuid primary key default gen_random_uuid(),
  -- 8 characters from a 32 character alphabet => 2^40 possible codes.
  join_code           text        not null,
  status              text        not null default 'waiting',
  board               text[]      not null,
  current_turn        text        not null default 'X',
  winning_combination integer[],
  winner_symbol       text,
  result              text,
  version             integer     not null default 1,
  round_number        integer     not null default 1,
  last_move_index     integer,
  moves_played        integer     not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  expires_at          timestamptz not null default (now() + interval '2 hours'),

  constraint online_rooms_join_code_key   unique (join_code),
  constraint online_rooms_status_check     check (status in ('waiting', 'active', 'finished', 'expired')),
  constraint online_rooms_turn_check       check (current_turn in ('X', 'O')),
  constraint online_rooms_winner_check     check (winner_symbol is null or winner_symbol in ('X', 'O')),
  constraint online_rooms_result_check     check (result is null or result in ('X', 'O', 'draw')),
  constraint online_rooms_version_check    check (version > 0),
  constraint online_rooms_round_check      check (round_number > 0),
  constraint online_rooms_moves_check      check (moves_played between 0 and 9),
  constraint online_rooms_last_move_check  check (last_move_index is null or last_move_index between 0 and 8),
  constraint online_rooms_win_combo_check  check (winning_combination is null or cardinality(winning_combination) = 3)
);

comment on table public.online_rooms is 'Authoritative state of a private online Tic-Tac-Toe room.';

-- Membership of a room. At most two rows per room (X and O).
create table if not exists public.online_room_players (
  room_id           uuid        not null references public.online_rooms(id) on delete cascade,
  user_id           uuid        not null references auth.users(id) on delete cascade,
  player_symbol     text        not null,
  display_name      text,
  is_owner          boolean     not null default false,
  rematch_requested boolean     not null default false,
  joined_at         timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),

  -- one membership row per user per room
  constraint online_room_players_pkey primary key (room_id, user_id),
  -- a symbol may only be taken once per room (=> at most two players)
  constraint online_room_players_room_symbol_key unique (room_id, player_symbol) deferrable initially deferred,
  constraint online_room_players_symbol_check check (player_symbol in ('X', 'O')),
  constraint online_room_players_name_check check (
    display_name is null
    or (char_length(display_name) between 1 and 24 and display_name !~ '[[:cntrl:]]')
  )
);

comment on table public.online_room_players is 'Seat assignments for an online room (max two players).';

-- Append only audit log of the moves that were applied. The unique move id
-- makes retries idempotent.
create table if not exists public.online_moves (
  id             bigint generated always as identity primary key,
  room_id        uuid        not null references public.online_rooms(id) on delete cascade,
  move_id        uuid        not null,
  user_id        uuid        not null references auth.users(id) on delete cascade,
  player_symbol  text        not null,
  cell_index     integer     not null,
  board_after    text[]      not null,
  move_number    integer     not null,
  created_at     timestamptz not null default now(),

  constraint online_moves_room_move_key unique (room_id, move_id),
  constraint online_moves_symbol_check  check (player_symbol in ('X', 'O')),
  constraint online_moves_cell_check    check (cell_index between 0 and 8),
  constraint online_moves_number_check  check (move_number between 1 and 9)
);

comment on table public.online_moves is 'Immutable audit log of applied online moves (idempotency key).';

-- Index used by the expiry sweep and by the "rooms owned by a user" lookup.
create index if not exists online_rooms_expires_at_idx on public.online_rooms (expires_at);
create index if not exists online_rooms_status_idx    on public.online_rooms (status);
create index if not exists online_room_players_user_idx on public.online_room_players (user_id);
create index if not exists online_moves_room_idx        on public.online_moves (room_id, move_number);

-- -----------------------------------------------------------------------------
-- 2. Helper functions (pure / security definer helpers)
-- -----------------------------------------------------------------------------

-- A board is valid when it has exactly nine cells and every cell is null, X or O.
create or replace function public.online_board_is_valid(p_board text[])
returns boolean
language sql
immutable
as $$
  select p_board is not null
     and cardinality(p_board) = 9
     and not exists (
       select 1 from unnest(p_board) as cell
       where cell is not null and cell <> 'X' and cell <> 'O'
     );
$$;

-- Returns the three indexes of a winning line, or null.
create or replace function public.online_winning_combination(p_board text[])
returns integer[]
language plpgsql
immutable
as $$
declare
  c constant integer[][] := array[
    array[0, 1, 2], array[3, 4, 5], array[6, 7, 8],
    array[0, 3, 6], array[1, 4, 7], array[2, 5, 8],
    array[0, 4, 8], array[2, 4, 6]
  ];
  i integer;
  a integer;
  b integer;
  d integer;
  v text;
begin
  if p_board is null or cardinality(p_board) <> 9 then
    return null;
  end if;

  for i in 1..8 loop
    a := c[i][1];
    b := c[i][2];
    d := c[i][3];
    v := p_board[a + 1];
    if v is not null and v = p_board[b + 1] and v = p_board[d + 1] then
      return array[a, b, d];
    end if;
  end loop;

  return null;
end;
$$;

-- True when the board has no empty cell left.
create or replace function public.online_board_is_full(p_board text[])
returns boolean
language sql
immutable
as $$
  select p_board is not null
     and cardinality(p_board) = 9
     and not exists (select 1 from unnest(p_board) as cell where cell is null);
$$;

-- Strips control characters and truncates a display name.
create or replace function public.online_sanitize_name(p_name text)
returns text
language sql
immutable
as $$
  select nullif(left(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g'), 24), '');
$$;

-- Uppercases a code and removes everything that is not alphanumeric.
create or replace function public.online_normalize_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
$$;

-- The canonical join code format: 8 characters of a 32 character alphabet.
create or replace function public.online_code_is_valid(p_code text)
returns boolean
language sql
immutable
as $$
  select p_code ~ '^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$';
$$;

-- Cryptographically strong join code.
-- gen_random_uuid() is backed by the operating system CSPRNG; each of the
-- first eight bytes is mapped onto a 32 character alphabet. 256 % 32 = 0, so
-- the mapping is unbiased.
create or replace function public.online_generate_join_code()
returns text
language sql
volatile
as $$
  with raw as (
    select decode(replace(gen_random_uuid()::text, '-', ''), 'hex') as bytes
  )
  select string_agg(
           substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + (get_byte(bytes, i) % 32), 1),
           ''
         )
  from raw
  cross join generate_series(0, 7) as g(i);
$$;

-- Membership check used by the RLS policies.
-- SECURITY DEFINER so that the policy can call it without recursing into the
-- policies of online_room_players.
create or replace function public.online_is_room_member(p_room_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id is not null
     and exists (
       select 1 from public.online_room_players p
       where p.room_id = p_room_id and p.user_id = p_user_id
     );
$$;

-- Extracts the room uuid from a realtime topic such as `online-room:<uuid>`.
create or replace function public.online_room_id_from_topic(p_topic text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_topic, ':', 2)::uuid;
exception when others then
  return null;
end;
$$;

-- Keeps updated_at honest.
create or replace function public.online_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists online_rooms_touch_updated_at on public.online_rooms;
create trigger online_rooms_touch_updated_at
  before update on public.online_rooms
  for each row execute function public.online_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 3. The payload returned to the client
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER + STABLE so it can read the tables regardless of RLS.
-- It exposes nothing beyond what a member needs: no emails, no auth metadata.
create or replace function public.online_room_payload(p_room_id uuid, p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'room', jsonb_build_object(
      'id',                 r.id,
      'joinCode',           r.join_code,
      'status',             r.status,
      'board',              to_jsonb(r.board),
      'currentTurn',        r.current_turn,
      'winnerSymbol',       r.winner_symbol,
      'result',             r.result,
      'winningCombination', r.winning_combination,
      'version',            r.version,
      'roundNumber',        r.round_number,
      'lastMoveIndex',      r.last_move_index,
      'movesPlayed',        r.moves_played,
      'createdAt',          r.created_at,
      'updatedAt',          r.updated_at,
      'expiresAt',          r.expires_at
    ),
    'players', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'userId',      p.user_id,
                 'symbol',      p.player_symbol,
                 'displayName', p.display_name,
                 'isOwner',     p.is_owner,
                 'rematchRequested', p.rematch_requested,
                 'joinedAt',    p.joined_at,
                 'lastSeenAt',  p.last_seen_at
               ) order by p.player_symbol
             )
      from public.online_room_players p
      where p.room_id = r.id
    ), '[]'::jsonb),
    'mySymbol', (
      select p.player_symbol
      from public.online_room_players p
      where p.room_id = r.id and p.user_id = p_user_id
    )
  )
  from public.online_rooms r
  where r.id = p_room_id;
$$;

-- -----------------------------------------------------------------------------
-- 4. Client facing operations
-- -----------------------------------------------------------------------------

-- Create a private room. The creator always plays X.
create or replace function public.create_online_room(p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_room     public.online_rooms;
  v_code     text;
  v_attempts integer := 0;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  -- Practical rate limit: at most 20 rooms per user and hour.
  if (
    select count(*)
    from public.online_rooms r
    join public.online_room_players p on p.room_id = r.id
    where p.user_id = v_user and r.created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'online:rate_limited' using errcode = 'P0001';
  end if;

  loop
    v_code := public.online_generate_join_code();

    begin
      insert into public.online_rooms (join_code, status, board, current_turn, expires_at)
      values (
        v_code,
        'waiting',
        ARRAY[
          NULL::text, NULL::text, NULL::text,
          NULL::text, NULL::text, NULL::text,
          NULL::text, NULL::text, NULL::text
        ],
        'X',
        now() + interval '2 hours'
      )
      returning * into v_room;
      exit;
    exception when unique_violation then
      v_attempts := v_attempts + 1;
      if v_attempts > 5 then
        raise exception 'online:code_generation_failed' using errcode = 'P0001';
      end if;
    end;
  end loop;

  insert into public.online_room_players (room_id, user_id, player_symbol, display_name, is_owner)
  values (v_room.id, v_user, 'X', public.online_sanitize_name(p_display_name), true);

  return public.online_room_payload(v_room.id, v_user);
end;
$$;

-- Join a waiting room as the second player. The seat is allocated under a
-- row lock so two concurrent joins can never take the same seat.
create or replace function public.join_online_room(p_join_code text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user   uuid := auth.uid();
  v_room   public.online_rooms;
  v_code   text;
  v_seats  integer;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  v_code := public.online_normalize_code(p_join_code);
  if not public.online_code_is_valid(v_code) then
    raise exception 'online:invalid_code' using errcode = 'P0001';
  end if;

  select * into v_room
  from public.online_rooms
  where join_code = v_code
  for update;

  if not found then
    raise exception 'online:room_not_found' using errcode = 'P0001';
  end if;

  if v_room.status = 'expired' or v_room.expires_at < now() then
    update public.online_rooms set status = 'expired' where id = v_room.id;
    raise exception 'online:room_expired' using errcode = 'P0001';
  end if;

  if v_room.status = 'finished' then
    raise exception 'online:room_finished' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.online_room_players p
    where p.room_id = v_room.id and p.user_id = v_user
  ) then
    -- The creator (or a player who already joined) may never take a second
    -- seat. They can still read their own room through get_online_room_state.
    raise exception 'online:already_in_room' using errcode = 'P0001';
  end if;

  select count(*) into v_seats
  from public.online_room_players
  where room_id = v_room.id;

  if v_seats >= 2 then
    raise exception 'online:room_full' using errcode = 'P0001';
  end if;

  insert into public.online_room_players (room_id, user_id, player_symbol, display_name)
  values (v_room.id, v_user, 'O', public.online_sanitize_name(p_display_name));

  update public.online_rooms
     set status = 'active', version = version + 1
   where id = v_room.id;

  return public.online_room_payload(v_room.id, v_user);
end;
$$;

-- Read the authoritative state of a room the caller is a member of.
create or replace function public.get_online_room_state(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_room public.online_rooms;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  v_code := public.online_normalize_code(p_join_code);
  if not public.online_code_is_valid(v_code) then
    raise exception 'online:invalid_code' using errcode = 'P0001';
  end if;

  select * into v_room
  from public.online_rooms
  where join_code = v_code
  for share;

  if not found then
    raise exception 'online:room_not_found' using errcode = 'P0001';
  end if;

  if not public.online_is_room_member(v_room.id, v_user) then
    raise exception 'online:not_a_member' using errcode = 'P0001';
  end if;

  -- heartbeat
  update public.online_room_players
     set last_seen_at = now()
   where room_id = v_room.id and user_id = v_user;

  return public.online_room_payload(v_room.id, v_user);
end;
$$;

-- Apply exactly one move. Everything is validated inside the database.
create or replace function public.submit_online_move(
  p_join_code       text,
  p_cell_index      integer,
  p_expected_version integer,
  p_move_id         uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user       uuid := auth.uid();
  v_code       text;
  v_room       public.online_rooms;
  v_symbol     text;
  v_board      text[];
  v_status     text;
  v_result     text;
  v_winner     text;
  v_combo      integer[];
  v_next_turn  text;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  if p_move_id is null then
    raise exception 'online:invalid_move_id' using errcode = 'P0001';
  end if;

  if p_cell_index is null or p_cell_index < 0 or p_cell_index > 8 then
    raise exception 'online:invalid_cell' using errcode = 'P0001';
  end if;

  v_code := public.online_normalize_code(p_join_code);
  if not public.online_code_is_valid(v_code) then
    raise exception 'online:invalid_code' using errcode = 'P0001';
  end if;

  -- Serialise every move of this room on the room row.
  select * into v_room
  from public.online_rooms
  where join_code = v_code
  for update;

  if not found then
    raise exception 'online:room_not_found' using errcode = 'P0001';
  end if;

  select p.player_symbol into v_symbol
  from public.online_room_players p
  where p.room_id = v_room.id and p.user_id = v_user;

  if v_symbol is null then
    raise exception 'online:not_a_member' using errcode = 'P0001';
  end if;

  -- Idempotency: the same move id is never applied twice.
  if exists (
    select 1 from public.online_moves m
    where m.room_id = v_room.id and m.move_id = p_move_id
  ) then
    return public.online_room_payload(v_room.id, v_user);
  end if;

  if v_room.status <> 'active' then
    raise exception 'online:game_not_active' using errcode = 'P0001';
  end if;

  if v_room.result is not null then
    raise exception 'online:game_finished' using errcode = 'P0001';
  end if;

  if v_room.current_turn <> v_symbol then
    raise exception 'online:not_your_turn' using errcode = 'P0001';
  end if;

  -- Compare and swap: a client that based its move on an outdated board is
  -- rejected instead of overwriting a newer state.
  if p_expected_version is not null and p_expected_version <> v_room.version then
    raise exception 'online:stale_version' using errcode = 'P0001';
  end if;

  v_board := v_room.board;
  if v_board[p_cell_index + 1] is not null then
    raise exception 'online:cell_taken' using errcode = 'P0001';
  end if;

  v_board[p_cell_index + 1] := v_symbol;

  v_combo := public.online_winning_combination(v_board);
  if v_combo is not null then
    v_status := 'finished';
    v_result := v_symbol;
    v_winner := v_symbol;
  elsif public.online_board_is_full(v_board) then
    v_status := 'finished';
    v_result := 'draw';
    v_winner := null;
  else
    v_status := 'active';
    v_result := null;
    v_winner := null;
    v_next_turn := case when v_symbol = 'X' then 'O' else 'X' end;
  end if;

  update public.online_rooms
     set board               = v_board,
         current_turn        = case when v_status = 'finished' then current_turn else v_next_turn end,
         status              = v_status,
         result              = v_result,
         winner_symbol       = v_winner,
         winning_combination = v_combo,
         version             = version + 1,
         moves_played        = moves_played + 1,
         last_move_index     = p_cell_index
   where id = v_room.id;

  insert into public.online_moves (room_id, move_id, user_id, player_symbol, cell_index, board_after, move_number)
  values (v_room.id, p_move_id, v_user, v_symbol, p_cell_index, v_board, v_room.moves_played + 1);

  return public.online_room_payload(v_room.id, v_user);
end;
$$;

-- Request (or accept) a rematch. The new round only starts once both
-- players have asked for it.
create or replace function public.request_online_rematch(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_room public.online_rooms;
  v_both integer;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  v_code := public.online_normalize_code(p_join_code);
  if not public.online_code_is_valid(v_code) then
    raise exception 'online:invalid_code' using errcode = 'P0001';
  end if;

  select * into v_room
  from public.online_rooms
  where join_code = v_code
  for update;

  if not found then
    raise exception 'online:room_not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.online_room_players p
    where p.room_id = v_room.id and p.user_id = v_user
  ) then
    raise exception 'online:not_a_member' using errcode = 'P0001';
  end if;

  -- A rematch may only be requested once the match has actually finished.
  -- Without this check two players could reset the board in the middle of a
  -- running game.
  if v_room.status <> 'finished' then
    raise exception 'online:game_not_finished' using errcode = 'P0001';
  end if;

  update public.online_room_players
     set rematch_requested = true
   where room_id = v_room.id and user_id = v_user;

  select count(*) into v_both
  from public.online_room_players
  where room_id = v_room.id and rematch_requested;

  if v_both >= 2 then
    -- Both players agreed: start a new round. The X symbol alternates, so
    -- the player who played O in the previous round opens the next one.
    update public.online_room_players
       set player_symbol = case player_symbol when 'X' then 'O' else 'X' end
     where room_id = v_room.id;

    update public.online_room_players
       set rematch_requested = false
     where room_id = v_room.id;

    update public.online_rooms
       set board               = ARRAY[
                                NULL::text, NULL::text, NULL::text,
                                NULL::text, NULL::text, NULL::text,
                                NULL::text, NULL::text, NULL::text
                              ],
           current_turn        = 'X',
           status              = 'active',
           result              = null,
           winner_symbol       = null,
           winning_combination = null,
           version             = version + 1,
           round_number        = round_number + 1,
           moves_played        = 0,
           last_move_index     = null
     where id = v_room.id;
  else
    -- Only one player asked so far: bump the version so the opponent is
    -- notified through realtime.
    update public.online_rooms
       set version = version + 1
     where id = v_room.id;
  end if;

  return public.online_room_payload(v_room.id, v_user);
end;
$$;

-- Leave a room.
--   * owner leaves a waiting room  -> the room expires
--   * player leaves an active match -> the match ends, no forfeit win is given
--   * last player leaves            -> the room expires
create or replace function public.leave_online_room(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user     uuid := auth.uid();
  v_code     text;
  v_room     public.online_rooms;
  v_remaining integer;
begin
  if v_user is null then
    raise exception 'online:unauthenticated' using errcode = 'P0001';
  end if;

  v_code := public.online_normalize_code(p_join_code);
  if not public.online_code_is_valid(v_code) then
    raise exception 'online:invalid_code' using errcode = 'P0001';
  end if;

  select * into v_room
  from public.online_rooms
  where join_code = v_code
  for update;

  if not found then
    raise exception 'online:room_not_found' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.online_room_players p
    where p.room_id = v_room.id and p.user_id = v_user
  ) then
    raise exception 'online:not_a_member' using errcode = 'P0001';
  end if;

  delete from public.online_room_players
  where room_id = v_room.id and user_id = v_user;

  select count(*) into v_remaining
  from public.online_room_players
  where room_id = v_room.id;

  if v_remaining = 0 or v_room.status = 'waiting' then
    update public.online_rooms set status = 'expired', version = version + 1 where id = v_room.id;
  elsif v_room.status = 'active' then
    -- A player left in the middle of the match. The match ends, but the
    -- remaining player is NOT declared the winner.
    update public.online_rooms set status = 'finished', version = version + 1 where id = v_room.id;
  else
    update public.online_rooms set version = version + 1 where id = v_room.id;
  end if;

  return jsonb_build_object('left', true, 'roomId', v_room.id);
end;
$$;

-- Marks abandoned rooms as expired. Safe to run repeatedly.
-- Call it from pg_cron or the Supabase SQL editor.
create or replace function public.online_expire_rooms()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.online_rooms
     set status = 'expired'
   where status in ('waiting', 'active')
     and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Row Level Security
-- -----------------------------------------------------------------------------
-- RLS is enabled on every exposed table. The default PUBLIC privileges are
-- revoked first, because adding a policy does not remove existing grants.
-- -----------------------------------------------------------------------------

alter table public.online_rooms         enable row level security;
alter table public.online_room_players  enable row level security;
alter table public.online_moves         enable row level security;

revoke all on table public.online_rooms        from anon, authenticated;
revoke all on table public.online_room_players from anon, authenticated;
revoke all on table public.online_moves        from anon, authenticated;

-- RLS policies are evaluated *in addition to* table privileges: without a
-- SELECT grant the policies would never be reached at all. Only SELECT is
-- granted, and the policies below restrict it to the caller's own room.
grant select on table public.online_rooms        to authenticated;
grant select on table public.online_room_players to authenticated;
grant select on table public.online_moves        to authenticated;

-- Members may read the room they belong to. Nothing else is readable.
drop policy if exists "Members can read their own room" on public.online_rooms;
create policy "Members can read their own room"
  on public.online_rooms
  for select
  to authenticated
  using (public.online_is_room_member(id, auth.uid()));

-- Members may read the seat rows of their own room (needed by the realtime
-- subscription and harmless: it only exposes their own room).
drop policy if exists "Members can read their own room seats" on public.online_room_players;
create policy "Members can read their own room seats"
  on public.online_room_players
  for select
  to authenticated
  using (public.online_is_room_member(room_id, auth.uid()));

-- The move log is readable by members of the room. It is never writable by a
-- client - only submit_online_move() inserts into it.
drop policy if exists "Members can read the move log of their room" on public.online_moves;
create policy "Members can read the move log of their room"
  on public.online_moves
  for select
  to authenticated
  using (public.online_is_room_member(room_id, auth.uid()));

-- There are deliberately NO insert / update / delete policies for the
-- `authenticated` role: clients cannot create rooms, join rooms, change the
-- board, assign themselves a symbol or award themselves a win directly.

-- -----------------------------------------------------------------------------
-- 6. Function privileges
-- -----------------------------------------------------------------------------
-- Only the `authenticated` role may execute the game operations. `anon`
-- (requests without a session) and the implicit PUBLIC grant are removed.
-- -----------------------------------------------------------------------------

revoke all on function public.create_online_room(text) from public, anon;
revoke all on function public.join_online_room(text, text) from public, anon;
revoke all on function public.get_online_room_state(text) from public, anon;
revoke all on function public.submit_online_move(text, integer, integer, uuid) from public, anon;
revoke all on function public.request_online_rematch(text) from public, anon;
revoke all on function public.leave_online_room(text) from public, anon;

grant execute on function public.create_online_room(text) to authenticated;
grant execute on function public.join_online_room(text, text) to authenticated;
grant execute on function public.get_online_room_state(text) to authenticated;
grant execute on function public.submit_online_move(text, integer, integer, uuid) to authenticated;
grant execute on function public.request_online_rematch(text) to authenticated;
grant execute on function public.leave_online_room(text) to authenticated;

-- The expiry sweep is an operational task, not a client operation.
revoke all on function public.online_expire_rooms() from public, anon, authenticated;
grant execute on function public.online_expire_rooms() to service_role;

-- Read only helpers used by the RLS policies.
revoke all on function public.online_is_room_member(uuid, uuid) from public, anon;
grant execute on function public.online_is_room_member(uuid, uuid) to authenticated;
revoke all on function public.online_room_id_from_topic(text) from public, anon;
grant execute on function public.online_room_id_from_topic(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 7. Realtime
-- -----------------------------------------------------------------------------
-- The room row is published so clients receive a notification when the
-- authoritative state changes. The payload itself is always re-read from the
-- database, the event is only a "something changed" signal.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'online_rooms'
     ) then
    alter publication supabase_realtime add table public.online_rooms;
  end if;
end
$$;

-- Authorisation for private realtime channels (`online-room:<uuid>`).
-- Only members of the room may subscribe to its channel.
-- The realtime.messages table only exists when the Realtime extension is
-- installed, so the policy is created defensively.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$
      drop policy if exists "Members can access their private online room channel" on realtime.messages;
    $policy$;

    execute $policy$
      create policy "Members can access their private online room channel"
        on realtime.messages
        for select
        to authenticated
        using (
          realtime.topic() like 'online-room:%'
          and public.online_is_room_member(
            public.online_room_id_from_topic(realtime.topic()),
            auth.uid()
          )
        );
    $policy$;
  end if;
end
$$;
