/**
 * Types for the online multiplayer mode.
 *
 * These mirror the JSON payload produced by the PostgreSQL functions in
 * `supabase/migrations/0001_online_multiplayer.sql`.
 */
import type { Cell, Player } from '../game/types'

export type OnlineRoomStatus = 'waiting' | 'active' | 'finished' | 'expired'

export type OnlineResult = 'X' | 'O' | 'draw'

/** Authoritative room snapshot as stored in the database. */
export interface OnlineRoom {
  id: string
  joinCode: string
  status: OnlineRoomStatus
  board: Cell[]
  currentTurn: Player
  winnerSymbol: Player | null
  result: OnlineResult | null
  winningCombination: number[] | null
  /** Monotonically increasing - used to ignore out of order updates. */
  version: number
  roundNumber: number
  lastMoveIndex: number | null
  movesPlayed: number
  createdAt: string
  updatedAt: string
  expiresAt: string
}

export interface OnlinePlayer {
  userId: string
  symbol: Player
  displayName: string | null
  isOwner: boolean
  rematchRequested: boolean
  joinedAt: string
  lastSeenAt: string
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
