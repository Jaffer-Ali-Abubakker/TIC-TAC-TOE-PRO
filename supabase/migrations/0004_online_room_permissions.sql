-- TIC-006 - room permissions.
--
-- Roles
--   * host  - the creator (`online_room_players.is_owner = true`), owns the
--             room, its code and its invite link.
--   * guest - the second seat, joined through the code or the invite link.
--             It may only play and leave.
--
-- Leaving
--   * host leaves  -> the room is `closed` for good: the code can never be
--                     joined again and the guest's client is returned to the
--                     lobby ("Host left the room").
--   * guest leaves -> the seat is freed and the room goes back to `waiting`,
--                     so the host keeps the code and can invite someone else.
--
-- Mutations still only happen through the SECURITY DEFINER functions (every
-- write privilege is revoked from `authenticated`), so the rules below cannot
-- be bypassed from the browser.

-- -----------------------------------------------------------------------------
-- 1. Room status gains `closed` (host left / room deleted).
-- -----------------------------------------------------------------------------

alter table public.online_rooms
  drop constraint if exists online_rooms_status_check;

alter table public.online_rooms
  add constraint online_rooms_status_check
  check (status in ('waiting', 'active', 'finished', 'expired', 'closed'));

-- -----------------------------------------------------------------------------
-- 2. `create_online_room`: only the board-size validation lives here. The
--    "already in a room" guard is client side on purpose (see the note in the
--    function body).
-- -----------------------------------------------------------------------------

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

  -- A seated player may not open a second room from the app, but the database
  -- does NOT hard-block it: an abandoned waiting room would otherwise lock the
  -- user out for two hours. The client refuses it (useOnlineRoom.createRoom)
  -- and the hourly rate limit caps abuse.

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

-- -----------------------------------------------------------------------------
-- 3. Joining: a closed room is refused with its own code, so the client can
--    say "Host left, this link is invalid" instead of "not found".
-- -----------------------------------------------------------------------------

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

  if v_room.status = 'closed' then
    raise exception 'online:room_closed' using errcode = 'P0001';
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

-- -----------------------------------------------------------------------------
-- 4. Leaving is role aware: the host closes the room, the guest only frees the
--    seat so the host can invite a new opponent with the same code.
-- -----------------------------------------------------------------------------

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
  v_is_owner boolean;
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

  select p.is_owner into v_is_owner
  from public.online_room_players p
  where p.room_id = v_room.id and p.user_id = v_user;

  if not found then
    raise exception 'online:not_a_member' using errcode = 'P0001';
  end if;

  delete from public.online_room_players
  where room_id = v_room.id and user_id = v_user;

  if v_is_owner then
    -- The owner left: the room is closed for good. The guest seat is kept so
    -- that client can still read the snapshot and see why it ended; the code
    -- can never be joined again.
    update public.online_rooms
       set status = 'closed', version = version + 1
     where id = v_room.id;
  elsif v_room.status in ('waiting', 'active', 'finished') then
    -- The guest left: free the seat, reset the board and wait for a new one.
    update public.online_room_players
       set rematch_requested = false
     where room_id = v_room.id;

    update public.online_rooms
       set status              = 'waiting',
           board               = array_fill(null::text, array[v_room.rows * v_room.cols]),
           current_turn        = 'X',
           winner_symbol       = null,
           result              = null,
           winning_combination = null,
           moves_played        = 0,
           last_move_index     = null,
           version             = version + 1
     where id = v_room.id;
  else
    update public.online_rooms
       set version = version + 1
     where id = v_room.id;
  end if;

  return jsonb_build_object('left', true, 'roomId', v_room.id);
end;
$$;
