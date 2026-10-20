import type { Board, Cell, GameStatus, Player } from './types'

export const BOARD_SIZE = 9

/** Every winning line: 3 rows, 3 columns, 2 diagonals. */
export const WINNING_COMBINATIONS: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

export const CENTER_INDEX = 4
export const CORNER_INDICES: readonly number[] = [0, 2, 6, 8]

/** Creates a fresh, empty board. */
export function createInitialBoard(): Board {
  return Array<Cell>(BOARD_SIZE).fill(null)
}

/**
 * Returns the three indexes that form a winning line, or `null` when the board
 * has no winner.
 */
export function getWinningCombination(board: Board): number[] | null {
  for (const combination of WINNING_COMBINATIONS) {
    const [a, b, c] = combination
    const value = board[a]
    if (value !== null && value === board[b] && value === board[c]) {
      return [a, b, c]
    }
  }
  return null
}

/** Returns the winning player, or `null` when nobody has won. */
export function getWinner(board: Board): Player | null {
  const combination = getWinningCombination(board)
  if (!combination) return null
  return board[combination[0]]
}

/** True when every cell is occupied. */
export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null)
}

/**
 * Single source of truth for the state of a board.
 * A win always takes precedence over a full board.
 */
export function getGameStatus(board: Board): GameStatus {
  if (getWinner(board) !== null) return 'won'
  if (isBoardFull(board)) return 'draw'
  return 'playing'
}

/** Indexes of all cells that are still empty. */
export function getAvailableMoves(board: Board): number[] {
  const moves: number[] = []
  for (let index = 0; index < board.length; index += 1) {
    if (board[index] === null) moves.push(index)
  }
  return moves
}

/** True when the given index addresses a real cell of the board. */
export function isValidIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < BOARD_SIZE
}

/** Error thrown when a move is rejected by the rules engine. */
export class InvalidMoveError extends Error {
  readonly code: 'out-of-range' | 'occupied' | 'game-over' | 'invalid-player'

  constructor(
    code: 'out-of-range' | 'occupied' | 'game-over' | 'invalid-player',
    message: string,
  ) {
    super(message)
    this.name = 'InvalidMoveError'
    this.code = code
  }
}

/**
 * Returns a **new** board with `player` placed at `index`.
 * The input board is never mutated.
 *
 * @throws {InvalidMoveError} when the index is out of range, the cell is
 * already taken, the round is already finished, or the player is invalid.
 */
export function makeMove(board: Board, index: number, player: Player): Board {
  if (!isValidIndex(index)) {
    throw new InvalidMoveError('out-of-range', `Cell index ${index} is out of range.`)
  }
  if (player !== 'X' && player !== 'O') {
    throw new InvalidMoveError('invalid-player', `Invalid player "${String(player)}".`)
  }
  if (getGameStatus(board) !== 'playing') {
    throw new InvalidMoveError('game-over', 'The round is already finished.')
  }
  if (board[index] !== null) {
    throw new InvalidMoveError('occupied', `Cell ${index} is already occupied.`)
  }

  const next: Cell[] = board.slice()
  next[index] = player
  return next
}

/** Convenience predicate: could a move legally be played at `index`? */
export function canPlayAt(board: Board, index: number): boolean {
  if (!isValidIndex(index)) return false
  if (board[index] !== null) return false
  return getGameStatus(board) === 'playing'
}

/** Stable, human readable key for a board position. Used for AI memoization. */
export function boardKey(board: Board): string {
  return board.map((cell) => (cell === null ? '.' : cell)).join('')
}
