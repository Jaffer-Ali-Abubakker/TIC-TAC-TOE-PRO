/**
 * Thin, typed wrappers around the PostgreSQL functions that own the online
 * game state.
 *
 * Every call goes through a `SECURITY DEFINER` function, so the database -
 * not the browser - decides whether a move is legal. The client never sends
 * a player id, a symbol, a winner or a turn.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cell, Player } from '../game/types'
import { normalizeRoomCode } from './roomCode'
import { OnlineError, type OnlineErrorCode, type OnlineRoom, type OnlineRoomState } from './types'

/** Friendly, user facing text for every error the server can produce. */
const ERROR_MESSAGES: Record<OnlineErrorCode, string> = {
  unauthenticated: 'Your session expired. Reload the page to start a new anonymous session.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  invalid_code: 'That room code is not valid. Codes are eight characters, for example ABCD-1234.',
  room_not_found: 'No room with that code was found. Check the code and try again.',
  room_expired: 'That room has expired. Create a new one instead.',
  room_finished: 'That match has already finished.',
  room_full: 'That room is already full - two players are seated.',
  already_in_room: 'You already have a seat in this room.',
  not_a_member: 'You are not a player of this room.',
  game_not_active: 'The match is not running.',
  game_finished: 'The match is already over.',
  game_not_finished: 'A rematch can only be requested once the match is over.',
  not_your_turn: 'It is not your turn.',
  stale_version: 'The board changed on the other device. The latest position has been loaded.',
  cell_taken: 'That cell was just taken.',
  invalid_cell: 'That is not a valid cell.',
  invalid_move_id: 'The move could not be identified. Please try again.',
  code_generation_failed: 'The room code could not be generated. Please try again.',
  network: 'The connection failed. Check your network and try again.',
  unknown: 'Something went wrong. Please try again.',
}

const ERROR_CODES = new Set<string>(Object.keys(ERROR_MESSAGES))

/** Extracts a known error code from a PostgREST error. */
export function parseOnlineErrorCode(error: unknown): OnlineErrorCode {
  if (error instanceof OnlineError) return error.code

  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)

  const match = message.match(/online:([a-z_]+)/)
  if (match && ERROR_CODES.has(match[1])) {
    return match[1] as OnlineErrorCode
  }

  if (/failed to fetch|network|timeout|load failed/i.test(message)) {
    return 'network'
  }

  return 'unknown'
}

/** Converts any thrown value into a safe, user facing {@link OnlineError}. */
export function toOnlineError(error: unknown): OnlineError {
  if (error instanceof OnlineError) return error
  const code = parseOnlineErrorCode(error)
  return new OnlineError(code, ERROR_MESSAGES[code])
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asPlayer(value: unknown): Player {
  return value === 'O' ? 'O' : 'X'
}

function asCell(value: unknown): Cell {
  return value === 'X' || value === 'O' ? value : null
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Validates the payload returned by the database before it reaches the UI.
 * A malformed payload is treated as "no state" instead of crashing the app.
 */
export function parseOnlineRoomState(raw: unknown): OnlineRoomState | null {
  if (!isRecord(raw)) return null
  const roomRaw = raw.room
  if (!isRecord(roomRaw)) return null

  const boardRaw = roomRaw.board
  if (!Array.isArray(boardRaw) || boardRaw.length !== 9) return null

  const winningRaw = roomRaw.winningCombination
  const winningCombination =
    Array.isArray(winningRaw) && winningRaw.length === 3
      ? winningRaw.map((value) => Number(value)).filter((value) => Number.isInteger(value))
      : null

  const room: OnlineRoom = {
    id: String(roomRaw.id ?? ''),
    joinCode: String(roomRaw.joinCode ?? ''),
    status: (roomRaw.status ?? 'waiting') as OnlineRoom['status'],
    board: boardRaw.map(asCell),
    currentTurn: asPlayer(roomRaw.currentTurn),
    winnerSymbol: roomRaw.winnerSymbol === 'X' || roomRaw.winnerSymbol === 'O' ? roomRaw.winnerSymbol : null,
    result:
      roomRaw.result === 'X' || roomRaw.result === 'O' || roomRaw.result === 'draw'
        ? roomRaw.result
        : null,
    winningCombination: winningCombination && winningCombination.length === 3 ? winningCombination : null,
    version: Number(roomRaw.version ?? 0),
    roundNumber: Number(roomRaw.roundNumber ?? 1),
    lastMoveIndex:
      typeof roomRaw.lastMoveIndex === 'number' ? roomRaw.lastMoveIndex : null,
    movesPlayed: Number(roomRaw.movesPlayed ?? 0),
    createdAt: String(roomRaw.createdAt ?? ''),
    updatedAt: String(roomRaw.updatedAt ?? ''),
    expiresAt: String(roomRaw.expiresAt ?? ''),
  }

  const playersRaw = Array.isArray(raw.players) ? raw.players : []
  const players = playersRaw.filter(isRecord).map((player) => ({
    userId: String(player.userId ?? ''),
    symbol: asPlayer(player.symbol),
    displayName: asStringOrNull(player.displayName),
    isOwner: player.isOwner === true,
    rematchRequested: player.rematchRequested === true,
    joinedAt: String(player.joinedAt ?? ''),
    lastSeenAt: String(player.lastSeenAt ?? ''),
  }))

  const mySymbol =
    raw.mySymbol === 'X' || raw.mySymbol === 'O' ? raw.mySymbol : null

  return { room, players, mySymbol }
}

async function callRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await client.rpc(name, args)
  if (error) throw toOnlineError(error)
  return data
}

function requireState(raw: unknown): OnlineRoomState {
  const state = parseOnlineRoomState(raw)
  if (!state) {
    throw new OnlineError('unknown', ERROR_MESSAGES.unknown)
  }
  return state
}

/** Creates a private room. The caller is seated as X. */
export async function createOnlineRoom(
  client: SupabaseClient,
  displayName: string,
): Promise<OnlineRoomState> {
  const raw = await callRpc(client, 'create_online_room', { p_display_name: displayName })
  return requireState(raw)
}

/** Joins a waiting room. The caller is seated as O. */
export async function joinOnlineRoom(
  client: SupabaseClient,
  joinCode: string,
  displayName: string,
): Promise<OnlineRoomState> {
  const raw = await callRpc(client, 'join_online_room', {
    p_join_code: normalizeRoomCode(joinCode),
    p_display_name: displayName,
  })
  return requireState(raw)
}

/** Reads the authoritative state of a room the caller belongs to. */
export async function fetchOnlineRoomState(
  client: SupabaseClient,
  joinCode: string,
): Promise<OnlineRoomState> {
  const raw = await callRpc(client, 'get_online_room_state', {
    p_join_code: normalizeRoomCode(joinCode),
  })
  return requireState(raw)
}

/** Submits exactly one move. The database validates and applies it. */
export async function submitOnlineMove(
  client: SupabaseClient,
  options: {
    joinCode: string
    cellIndex: number
    expectedVersion: number | null
    moveId: string
  },
): Promise<OnlineRoomState> {
  const raw = await callRpc(client, 'submit_online_move', {
    p_join_code: normalizeRoomCode(options.joinCode),
    p_cell_index: options.cellIndex,
    p_expected_version: options.expectedVersion,
    p_move_id: options.moveId,
  })
  return requireState(raw)
}

/** Requests (or accepts) a rematch. The new round starts once both agree. */
export async function requestOnlineRematch(
  client: SupabaseClient,
  joinCode: string,
): Promise<OnlineRoomState> {
  const raw = await callRpc(client, 'request_online_rematch', {
    p_join_code: normalizeRoomCode(joinCode),
  })
  return requireState(raw)
}

/** Leaves the room. */
export async function leaveOnlineRoom(
  client: SupabaseClient,
  joinCode: string,
): Promise<void> {
  await callRpc(client, 'leave_online_room', {
    p_join_code: normalizeRoomCode(joinCode),
  })
}
