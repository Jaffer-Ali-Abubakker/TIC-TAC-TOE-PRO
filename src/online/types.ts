/**
 * Types for the online multiplayer mode.
 *
 * These mirror the JSON payload produced by the PostgreSQL functions in
 * `supabase/migrations/0001_online_multiplayer.sql`.
 *
 * The row shapes are derived from `database.types.ts`, which is generated
 * straight from the live schema with:
 *
 *   supabase gen types typescript --db-url "<pooler url>" --schema public
 *
 * so a schema change shows up as a type error instead of a runtime surprise.
 */
import type { Cell, Player } from '../game/types'
import type { Database } from './database.types'

type RoomRow = Database['public']['Tables']['online_rooms']['Row']
type PlayerRow = Database['public']['Tables']['online_room_players']['Row']

export type OnlineRoomStatus = 'waiting' | 'active' | 'finished' | 'expired'

export type OnlineResult = 'X' | 'O' | 'draw'

/** Authoritative room snapshot as stored in the database. */
export interface OnlineRoom {
  id: RoomRow['id']
  joinCode: RoomRow['join_code']
  status: OnlineRoomStatus
  board: Cell[]
  currentTurn: Player
  winnerSymbol: Player | null
  result: OnlineResult | null
  winningCombination: number[] | null
  /** Monotonically increasing - used to ignore out of order updates. */
  version: RoomRow['version']
  roundNumber: RoomRow['round_number']
  lastMoveIndex: RoomRow['last_move_index']
  movesPlayed: RoomRow['moves_played']
  createdAt: RoomRow['created_at']
  updatedAt: RoomRow['updated_at']
  expiresAt: RoomRow['expires_at']
}

export interface OnlinePlayer {
  userId: PlayerRow['user_id']
  symbol: Player
  displayName: PlayerRow['display_name']
  isOwner: PlayerRow['is_owner']
  rematchRequested: PlayerRow['rematch_requested']
  joinedAt: PlayerRow['joined_at']
  lastSeenAt: PlayerRow['last_seen_at']
}

/** Everything the client knows about the room it is in. */
export interface OnlineRoomState {
  room: OnlineRoom
  players: OnlinePlayer[]
  /** The symbol the authenticated user plays, or `null` when not seated. */
  mySymbol: Player | null
}

export type OnlinePhase =
  | 'unconfigured'
  | 'lobby'
  | 'connecting'
  | 'waiting'
  | 'active'
  | 'finished'
  | 'error'

export type OnlineConnectionStatus =
  | 'offline'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'

/** Machine readable error codes returned by the database functions. */
export type OnlineErrorCode =
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_code'
  | 'room_not_found'
  | 'room_expired'
  | 'room_finished'
  | 'room_full'
  | 'already_in_room'
  | 'not_a_member'
  | 'game_not_active'
  | 'game_finished'
  | 'game_not_finished'
  | 'not_your_turn'
  | 'stale_version'
  | 'cell_taken'
  | 'invalid_cell'
  | 'invalid_move_id'
  | 'code_generation_failed'
  | 'network'
  | 'unknown'

/** An error surfaced to the user, with a safe, friendly message. */
export class OnlineError extends Error {
  readonly code: OnlineErrorCode

  constructor(code: OnlineErrorCode, message: string) {
    super(message)
    this.name = 'OnlineError'
    this.code = code
  }
}
