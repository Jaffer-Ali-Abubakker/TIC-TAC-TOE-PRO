-- =============================================================================
-- Tic-Tac-Toe Pro - board size for online rooms (TIC-005)
-- =============================================================================
-- A room is no longer locked to 3x3. The creator picks the geometry, it is
-- stored on the room row, and every move is validated against it - so both
-- clients always play the same board.
--
-- Backwards compatible: existing rooms keep rows = cols = 3 and win_length = 3.
-- Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Room geometry
-- -----------------------------------------------------------------------------

alter table public.online_rooms
  add column if not exists rows       integer not null default 3,
  add column if not exists cols       integer not null default 3,
  add column if not exists win_length integer not null default 3;

comment on column public.online_rooms.rows is 'Board rows, 3-10 (chosen at creation, never changed).';
comment on column public.online_rooms.cols is 'Board columns, 3-10 (chosen at creation, never changed).';
comment on column public.online_rooms.win_length is 'Marks in a row needed to win, derived from rows x cols.';

-- The old checks assumed a fixed nine cell board, so they are replaced with
-- checks that follow the room geometry.
alter table public.online_rooms drop constraint if exists online_rooms_moves_check;
alter table public.online_rooms drop constraint if exists online_rooms_last_move_check;
alter table public.online_rooms drop constraint if exists online_rooms_win_combo_check;
alter table public.online_rooms drop constraint if exists online_rooms_rows_check;
alter table public.online_rooms drop constraint if exists online_rooms_cols_check;
alter table public.online_rooms drop constraint if exists online_rooms_cells_check;
alter table public.online_rooms drop constraint if exists online_rooms_win_length_check;
alter table public.online_rooms drop constraint if exists online_rooms_board_check;

alter table public.online_rooms
  add constraint online_rooms_rows_check       check (rows between 3 and 10),
  add constraint online_rooms_cols_check       check (cols between 3 and 10),
  add constraint online_rooms_cells_check      check (rows * cols <= 100),
  add constraint online_rooms_win_length_check check (win_length between 3 and 5),
  add constraint online_rooms_board_check      check (cardinality(board) = rows * cols),
  add constraint online_rooms_moves_check      check (moves_played between 0 and rows * cols),
  add constraint online_rooms_last_move_check  check (
    last_move_index is null or last_move_index between 0 and rows * cols - 1
  ),
  add constraint online_rooms_win_combo_check  check (
    winning_combination is null or cardinality(winning_combination) = win_length
  );

-- The move log can no longer cap the cell index at 8. submit_online_move()
-- validates it against the room, which is where the real limit lives.
alter table public.online_moves drop constraint if exists online_moves_cell_check;
alter table public.online_moves drop constraint if exists online_moves_number_check;

alter table public.online_moves
  add constraint online_moves_cell_check   check (cell_index >= 0),
  add constraint online_moves_number_check check (move_number >= 1);

-- -----------------------------------------------------------------------------
-- 2. Geometry helpers
-- -----------------------------------------------------------------------------

-- Same rule as `getWinLength()` in src/game/gameLogic.ts: three on 3x3, four
-- while both sides fit in 7, five above that.
create or replace function public.online_win_length(p_rows integer, p_cols integer)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_rows = 3 and p_cols = 3 then 3
    when p_rows <= 7 and p_cols <= 7 then 4
    else 5
  end;
$$;

-- Returns the indexes of the first winning line, or null. Walks the grid in
-- the four directions a line can take, so any rectangle works.
drop function if exists public.online_board_is_valid(text[]);
drop function if exists public.online_board_is_full(text[]);
drop function if exists public.online_winning_combination(text[]);

create or replace function public.online_board_is_full(
  p_board text[],
  p_rows  integer,
  p_cols  integer
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_board is not null
     and cardinality(p_board) = p_rows * p_cols
     and not exists (select 1 from unnest(p_board) as cell where cell is null);
$$;

create or replace function public.online_winning_combination(
  p_board text[],
  p_rows  integer,
  p_cols  integer,
  p_win   integer
)
returns integer[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_prefix text;
  r integer;
  c integer;
  d integer;
  k integer;
  dr integer;
  dc integer;
  v_index integer;
  v_mark text;
  v_cells integer[];
begin
  if p_board is null or p_rows < 1 or p_cols < 1 or p_win < 3 then
    return null;
  end if;
  if cardinality(p_board) <> p_rows * p_cols or p_win > p_rows * p_cols then
    return null;
  end if;

  for r in 0 .. p_rows - 1 loop
    for c in 0 .. p_cols - 1 loop
      -- 1: right, 2: down, 3: down-right, 4: down-left
      for d in 1 .. 4 loop
        dr := case when d = 1 then 0 else 1 end;
        dc := case d when 1 then 1 when 2 then 0 when 3 then 1 else -1 end;

        if r + dr * (p_win - 1) between 0 and p_rows - 1
           and c + dc * (p_win - 1) between 0 and p_cols - 1 then
          v_prefix := null;
          v_cells := '{}';

          for k in 0 .. p_win - 1 loop
            v_index := (r + dr * k) * p_cols + (c + dc * k);
            v_mark := p_board[v_index + 1];

            if v_mark is null or (v_prefix is not null and v_mark <> v_prefix) then
              v_cells := null;
              exit;
            end if;

            v_prefix := v_mark;
            v_cells := v_cells || v_index;
          end loop;

          if v_cells is not null then
            return v_cells;
          end if;
        end if;
      end loop;
    end loop;
  end loop;

  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. The payload now carries the geometry
-- -----------------------------------------------------------------------------

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
      'rows',               r.rows,
      'cols',               r.cols,
      'winLength',          r.win_length,
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
-- 4. Create with an explicit board size
-- -----------------------------------------------------------------------------
-- The win length is derived here, never taken from the client: the database
-- stays the authority on the rules.

drop function if exists public.create_online_room(text);

create or replace function public.create_online_room(
  p_display_name text,
  p_rows         integer default 3,
  p_cols         integer default 3
)
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

  if p_rows is null or p_cols is null
     or p_rows < 3 or p_rows > 10
     or p_cols < 3 or p_cols > 10
     or p_rows * p_cols > 100 then
    raise exception 'online:invalid_board_size' using errcode = 'P0001';
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
      insert into public.online_rooms (
        join_code, status, rows, cols, win_length, board, current_turn, expires_at
      )
      values (
        v_code,
        'waiting',
        p_rows,
        p_cols,
        public.online_win_length(p_rows, p_cols),
        array_fill(null::text, array[p_rows * p_cols]),
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

revoke all on function public.create_online_room(text, integer, integer) from public, anon;
grant execute on function public.create_online_room(text, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Moves and rematches follow the room geometry
-- -----------------------------------------------------------------------------

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

  if p_cell_index is null or p_cell_index < 0 then
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

  if p_cell_index > v_room.rows * v_room.cols - 1 then
    raise exception 'online:invalid_cell' using errcode = 'P0001';
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

  v_combo := public.online_winning_combination(
    v_board, v_room.rows, v_room.cols, v_room.win_length
  );
  if v_combo is not null then
    v_status := 'finished';
    v_result := v_symbol;
    v_winner := v_symbol;
  elsif public.online_board_is_full(v_board, v_room.rows, v_room.cols) then
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
    -- Both players agreed: start a new round on the same board geometry. The
    -- X symbol alternates, so the player who played O opens the next round.
    update public.online_room_players
       set player_symbol = case player_symbol when 'X' then 'O' else 'X' end
     where room_id = v_room.id;

    update public.online_room_players
       set rematch_requested = false
     where room_id = v_room.id;

    update public.online_rooms
       set board               = array_fill(null::text, array[v_room.rows * v_room.cols]),
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
