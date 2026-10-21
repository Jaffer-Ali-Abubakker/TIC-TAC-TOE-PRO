-- =============================================================================
-- Tic-Tac-Toe Pro - hosted database verification
-- =============================================================================
-- A single statement, so it can be run with:
--   * `supabase db query --db-url "<pooler url>" --file supabase/tests/verify_hosted.sql`
--   * or pasted into the Supabase SQL editor
--
-- Every value is compared against what the repository migration produces.
-- All of them must match, and `functions_without_search_path` must be 0.
-- =============================================================================
select
  (select count(*)::int from pg_tables
     where schemaname = 'public'
       and tablename in ('online_rooms','online_room_players','online_moves'))            as tables_expected_3,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'online%')                           as online_helpers,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'create_online_room','join_online_room','get_online_room_state',
       'submit_online_move','request_online_rematch','leave_online_room'))              as game_functions_expected_6,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'online%'
       and (p.proconfig is null or not exists (
             select 1 from unnest(p.proconfig) c where c like 'search_path=%')))        as functions_without_search_path_expected_0,
  (select count(*)::int from pg_policies where schemaname = 'public')                   as policies_expected_3,
  (select count(*)::int from pg_class c
     where c.relname in ('online_rooms','online_room_players','online_moves')
       and c.relrowsecurity)                                                            as rls_enabled_expected_3,
  (select count(*)::int from pg_publication_tables
     where pubname = 'supabase_realtime' and tablename = 'online_rooms')               as realtime_published_expected_1,
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'create_online_room','join_online_room','get_online_room_state',
       'submit_online_move','request_online_rematch','leave_online_room')
       and has_function_privilege('authenticated', p.oid, 'execute')
       and not has_function_privilege('anon', p.oid, 'execute'))                      as grants_ok_expected_6,
  (select case when has_function_privilege('anon','public.online_room_payload(uuid,uuid)','execute')
                 or has_function_privilege('authenticated','public.online_room_payload(uuid,uuid)','execute')
                then 0 else 1 end)                                                     as payload_locked_expected_1,
  (select count(*)::int from supabase_migrations.schema_migrations
     where version = '0001')                                                           as migration_recorded_expected_1,
  (select count(*)::int from public.online_rooms)                                       as rooms_remaining,
  (select count(*)::int from public.online_room_players)                                as players_remaining,
  (select count(*)::int from public.online_moves)                                       as moves_remaining;
