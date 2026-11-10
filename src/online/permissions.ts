/**
 * Who is allowed to do what in an online room.
 *
 * The role is **derived from the database** (the `is_owner` seat flag), never
 * stored locally, so a guest can never be promoted to host by refreshing the
 * page or by editing localStorage.
 */
import type { OnlineRoomStatus } from './types'

/** `null` means "no seat": the lobby, or a spectator of a full room. */
export type RoomRole = 'host' | 'guest' | null

export interface RoomPermissions {
  canCreateRoom: boolean
  canJoin: boolean
  canCopyCode: boolean
  canCopyLink: boolean
  canShare: boolean
  canPlay: boolean
  canLeave: boolean
  canStartRematch: boolean
  canAcceptRematch: boolean
  canChangeBoardSize: boolean
  canDeleteRoom: boolean
  canKick: boolean
}

const NONE: RoomPermissions = {
  canCreateRoom: false,
  canJoin: false,
  canCopyCode: false,
  canCopyLink: false,
  canShare: false,
  canPlay: false,
  canLeave: false,
  canStartRematch: false,
  canAcceptRematch: false,
  canChangeBoardSize: false,
  canDeleteRoom: false,
  canKick: false,
}

/**
 * Not in a room: anyone may create or join, and the board size is still
 * theirs to choose (the room does not exist yet).
 */
const LOBBY: RoomPermissions = {
  ...NONE,
  canCreateRoom: true,
  canJoin: true,
  canChangeBoardSize: true,
}

/**
 * The creator. Owns the code and the invite, can close the room (leaving
 * closes it) and start a rematch. The size is locked once the room exists.
 */
const HOST: RoomPermissions = {
  ...NONE,
  canCopyCode: true,
  canCopyLink: true,
  canShare: true,
  canLeave: true,
  canDeleteRoom: true,
}

/** The joiner (via the code or an invite link). Play and leave, nothing else. */
const GUEST: RoomPermissions = {
  ...NONE,
  canLeave: true,
}

/**
 * Someone with no seat while a room is open: a third visitor of a full link.
 * They may only walk away.
 */
const NO_SEAT: RoomPermissions = {
  ...NONE,
  canLeave: true,
}

export function getPermissions(
  role: RoomRole,
  status: OnlineRoomStatus | null,
): RoomPermissions {
  if (role === null) return status === null ? LOBBY : NO_SEAT

  const live = status === 'active'
  const over = status === 'finished'

  if (role === 'host') {
    return { ...HOST, canPlay: live, canStartRematch: over, canAcceptRematch: over }
  }

  // A guest can accept a rematch the host proposed, but never start one.
  return { ...GUEST, canPlay: live, canAcceptRematch: over }
}
