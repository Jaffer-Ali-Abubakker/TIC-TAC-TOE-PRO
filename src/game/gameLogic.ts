import type { Board, BoardSize, Cell, GameStatus, Player } from './types'

/** Cell count of the classic board. */
export const BOARD_SIZE = 9

/** Smallest and largest board dimension the game accepts. */
export const MIN_DIMENSION = 3
export const MAX_DIMENSION = 10

/** Hard limit for `rows * cols`. */
export const MAX_CELLS = 100

export const THREE_BY_THREE: BoardSize = { rows: 3, cols: 3, winLength: 3 }

/**
 * How many marks in a line win on a `rows x cols` board:
 * 3 on the classic board, 4 up to 7x7, 5 for anything bigger.
 */
export function getWinLength(rows: number, cols: number): number {
  if (rows === 3 && cols === 3) return 3
  if (rows <= 7 && cols <= 7) return 4
  return 5
}

/** Every straight line of `winLength` cells on the grid. */
export function generateWinLines(rows: number, cols: number, winLength: number): number[][] {
  const lines: number[][] = []

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols - winLength; col += 1) {
      const line: number[] = []
      for (let k = 0; k < winLength; k += 1) line.push(row * cols + col + k)
      lines.push(line)
    }
  }

  for (let col = 0; col < cols; col += 1) {
    for (let row = 0; row <= rows - winLength; row += 1) {
      const line: number[] = []
      for (let k = 0; k < winLength; k += 1) line.push((row + k) * cols + col)
      lines.push(line)
    }
  }

  for (let row = 0; row <= rows - winLength; row += 1) {
    for (let col = 0; col <= cols - winLength; col += 1) {
      const down: number[] = []
      const up: number[] = []
      for (let k = 0; k < winLength; k += 1) {
        down.push((row + k) * cols + col + k)
        up.push((row + k) * cols + col + winLength - 1 - k)
      }
      lines.push(down, up)
    }
  }

  return lines
}

/**
 * Validated size, or `null` when the request is outside the accepted limits.
 * This is the only place the 3-10 / 100 cell rules live.
 */
export function normaliseBoardSize(rows: number, cols: number): BoardSize | null {
  if (!Number.isInteger(rows) || !Number.isInteger(cols)) return null
  if (rows < MIN_DIMENSION || rows > MAX_DIMENSION) return null
  if (cols < MIN_DIMENSION || cols > MAX_DIMENSION) return null
  if (rows * cols > MAX_CELLS) return null
  return { rows, cols, winLength: getWinLength(rows, cols) }
}

/**
 * Win lines per board shape. Generating them on every status check would make
 * the AI quadratic, so they are cached for the (few) shapes the UI can produce.
 */
const lineCache = new Map<string, readonly (readonly number[])[]>()
const LINE_CACHE_LIMIT = 64

export function getWinLines(size: BoardSize): readonly (readonly number[])[] {
  const key = `${size.rows}x${size.cols}x${size.winLength}`
  const cached = lineCache.get(key)
  if (cached) return cached

  const lines = generateWinLines(size.rows, size.cols, size.winLength)
  if (lineCache.size >= LINE_CACHE_LIMIT) lineCache.clear()
  lineCache.set(key, lines)
  return lines
}

/** The eight classic lines, kept for the 3x3 call sites and the tests. */
export const WINNING_COMBINATIONS: readonly (readonly number[])[] = getWinLines(THREE_BY_THREE)

export const CENTER_INDEX = 4
export const CORNER_INDICES: readonly number[] = [0, 2, 6, 8]

// The board-shape parameter defaults to 3x3 for the classic call sites; every
// production caller passes the real size (see `GameState.boardSize`).
// shortcut: a 9 cell board is always read as 3x3, so a size mismatch would
// silently check the wrong lines; upgrade to a required parameter if a second
// board shape ever reaches these functions without its size.
export function createInitialBoard(size: BoardSize = THREE_BY_THREE): Board {
  return Array<Cell>(size.rows * size.cols).fill(null)
}

/**
 * Returns the indexes of a completed winning line, or `null` when the board
 * has no winner.
 */
export function getWinningCombination(
  board: Board,
  size: BoardSize = THREE_BY_THREE,
): number[] | null {
  for (const line of getWinLines(size)) {
    const value = board[line[0]]
    if (value === null || value === undefined) continue
    let complete = true
    for (let k = 1; k < line.length; k += 1) {
      if (board[line[k]] !== value) {
        complete = false
        break
      }
    }
    if (complete) return [...line]
  }
  return null
}

/** Returns the winning player, or `null` when nobody has won. */
export function getWinner(board: Board, size: BoardSize = THREE_BY_THREE): Player | null {
  const combination = getWinningCombination(board, size)
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
export function getGameStatus(board: Board, size: BoardSize = THREE_BY_THREE): GameStatus {
  if (getWinner(board, size) !== null) return 'won'
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
export function isValidIndex(index: number, cellCount: number = BOARD_SIZE): boolean {
  return Number.isInteger(index) && index >= 0 && index < cellCount
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
export function makeMove(
  board: Board,
  index: number,
  player: Player,
  size: BoardSize = THREE_BY_THREE,
): Board {
  if (!isValidIndex(index, board.length)) {
    throw new InvalidMoveError('out-of-range', `Cell index ${index} is out of range.`)
  }
  if (player !== 'X' && player !== 'O') {
    throw new InvalidMoveError('invalid-player', `Invalid player "${String(player)}".`)
  }
  if (getGameStatus(board, size) !== 'playing') {
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
export function canPlayAt(board: Board, index: number, size: BoardSize = THREE_BY_THREE): boolean {
  if (!isValidIndex(index, board.length)) return false
  if (board[index] !== null) return false
  return getGameStatus(board, size) === 'playing'
}

/** Stable, human readable key for a board position. Used for AI memoization. */
export function boardKey(board: Board): string {
  return board.map((cell) => (cell === null ? '.' : cell)).join('')
}
