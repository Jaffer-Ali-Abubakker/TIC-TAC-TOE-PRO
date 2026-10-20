/**
 * Shared domain types for Tic-Tac-Toe Pro.
 *
 * These types are intentionally free of any React or DOM dependency so that the
 * game engine can be unit tested in isolation.
 */

export type Player = 'X' | 'O'

export type Cell = Player | null

/** A board is a fixed length tuple of nine cells. */
export type Board = readonly Cell[]

/**
 * `pvc` = player versus computer, `pvp` = two local human players,
 * `online` = two players on separate devices (server authoritative).
 */
export type GameMode = 'pvc' | 'pvp' | 'online'

export type Difficulty = 'easy' | 'medium' | 'hard'

/** Lifecycle of a single round. */
export type GameStatus = 'playing' | 'won' | 'draw'

/** Outcome of a completed round. */
export type RoundResult = 'X' | 'O' | 'draw'

/** The opponent of a given player. */
export function opponentOf(player: Player): Player {
  return player === 'X' ? 'O' : 'X'
}

/** Per-mode score book. Kept separate so switching modes never mislabels history. */
export interface PvcStats {
  rounds: number
  playerWins: number
  computerWins: number
  draws: number
}

export interface PvpStats {
  rounds: number
  xWins: number
  oWins: number
  draws: number
}

/**
 * Statistics for the online mode. They are kept in their own book so the
 * local modes and the online mode never mix their records.
 */
export interface OnlineStats {
  rounds: number
  xWins: number
  oWins: number
  draws: number
}

export interface Stats {
  pvc: PvcStats
  pvp: PvpStats
  online: OnlineStats
}

/** One completed round recorded in the match history. */
export interface HistoryEntry {
  id: string
  round: number
  mode: GameMode
  result: RoundResult
  /** Human readable winner, e.g. "You", "Computer", "Player 2" or "Draw". */
  winnerLabel: string
  board: Cell[]
  timestamp: number
}
