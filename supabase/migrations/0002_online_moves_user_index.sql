-- =============================================================================
-- Tic-Tac-Toe Pro - index for the online_moves.user_id foreign key
-- =============================================================================
-- `supabase db advisors` reported the foreign key
-- `online_moves_user_id_fkey` as unindexed. Postgres does not create an index
-- for a foreign key automatically, so a lookup by user has to scan the whole
-- move log.
--
-- The other two foreign keys are already covered:
--   * online_moves.room_id        -> online_moves_room_idx (room_id, move_number)
--   * online_room_players.room_id -> the primary key (room_id, user_id)
--   * online_room_players.user_id -> online_room_players_user_idx (user_id)
-- =============================================================================

create index if not exists online_moves_user_id_idx on public.online_moves (user_id);
