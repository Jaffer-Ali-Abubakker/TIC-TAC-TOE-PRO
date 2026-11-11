import {
  THREE_BY_THREE,
  boardKey,
  getAvailableMoves,
  getGameStatus,
  getWinLines,
  getWinningCombination,
  getWinner,
  isBoardFull,
  makeMove,
} from './gameLogic'
import type { Board, BoardSize, Difficulty, Player } from './types'
import { opponentOf } from './types'

/** Injectable randomness so the AI can be tested deterministically. */
export type RandomSource = () => number

export const WIN_SCORE = 10
export const LOSS_SCORE = -10

/** Plies the 4x4 search looks ahead before it falls back to the heuristic. */
const MINIMAX_DEPTH_LIMIT = 4

/** Keeps a heuristic value far below the smallest win score. */
const HEURISTIC_SCALE = 1000

/** Bigger boards use the heuristic instead of the full search. */
const MAX_SEARCH_CELLS = 16

const MAX_MEMO_ENTRIES = 200_000

/**
 * Memoisation cache for the minimax search.
 * A position's value is fully determined by the board shape, the board, the
 * symbol of the computer, the symbol to move, the depth and the search limit.
 */
const memo = new Map<string, number>()

function memoKey(
  board: Board,
  size: BoardSize,
  aiPlayer: Player,
  playerToMove: Player,
  depth: number,
  limit: number,
): string {
  return `${size.rows}x${size.cols}x${size.winLength}|${boardKey(board)}|${aiPlayer}|${playerToMove}|${depth}|${limit}`
}

function cacheValue(key: string, value: number): void {
  if (memo.size > MAX_MEMO_ENTRIES) memo.clear()
  memo.set(key, value)
}

/**
 * Picks a move for `player` according to the requested difficulty.
 *
 * Returns `null` when the game is already finished or no move is available.
 * The board is never modified.
 */
export function chooseMove(
  board: Board,
  player: Player,
  difficulty: Difficulty,
  random: RandomSource = Math.random,
  size: BoardSize = THREE_BY_THREE,
): number | null {
  if (getGameStatus(board, size) !== 'playing') return null

  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  switch (difficulty) {
    case 'easy':
      return chooseEasyMove(board, random)
    case 'medium':
      return chooseMediumMove(board, player, random, size)
    case 'hard':
      return chooseHardMove(board, player, random, size)
    default:
      return null
  }
}

/** Easy: picks a random legal cell. */
export function chooseEasyMove(board: Board, random: RandomSource = Math.random): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null
  return pick(moves, random)
}

/**
 * Medium: win if possible, otherwise block the opponent, then prefer the
 * centre, then a corner, then any remaining legal cell at random.
 */
export function chooseMediumMove(
  board: Board,
  player: Player,
  random: RandomSource = Math.random,
  size: BoardSize = THREE_BY_THREE,
): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  const winning = findImmediateWin(board, player, size)
  if (winning !== null) return winning

  const blocking = findImmediateWin(board, opponentOf(player), size)
  if (blocking !== null) return blocking

  const centre = centreIndex(size)
  if (moves.includes(centre)) return centre

  const corner = cornerIndices(size).find((index) => moves.includes(index))
  if (corner !== undefined) return corner

  return pick(moves, random)
}

/**
 * Hard: never loses on 3x3 (full minimax), searches four plies on 4x4 and
 * switches to the line heuristic on anything bigger, so a 10x10 board answers
 * in a few milliseconds instead of freezing the page.
 */
export function chooseHardMove(
  board: Board,
  player: Player,
  random: RandomSource = Math.random,
  size: BoardSize = THREE_BY_THREE,
): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  if (size.rows * size.cols > MAX_SEARCH_CELLS) {
    return chooseHeuristicMove(board, player, random, size)
  }

  const limit = size.rows === 3 && size.cols === 3 ? Infinity : MINIMAX_DEPTH_LIMIT
  const nextPlayer = opponentOf(player)
  const scored = moves.map((index) => ({
    index,
    score: minimax(makeMove(board, index, player, size), player, nextPlayer, 1, size, limit),
  }))

  const best = Math.max(...scored.map((entry) => entry.score))
  const candidates = scored.filter((entry) => entry.score === best).map((entry) => entry.index)
  return pick(candidates, random)
}

/**
 * Heuristic player for the big boards: take a win, block a loss, otherwise
 * maximise the value of the lines the move improves.
 */
export function chooseHeuristicMove(
  board: Board,
  player: Player,
  random: RandomSource = Math.random,
  size: BoardSize = THREE_BY_THREE,
): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  const winning = findImmediateWin(board, player, size)
  if (winning !== null) return winning

  const blocking = findImmediateWin(board, opponentOf(player), size)
  if (blocking !== null) return blocking

  const centre = centreIndex(size)
  let best = -Infinity
  const candidates: number[] = []

  for (const index of moves) {
    const next = makeMove(board, index, player, size)
    const score = evaluateBoard(next, player, size) + (index === centre ? 1 : 0)
    if (score > best) {
      best = score
      candidates.length = 0
      candidates.push(index)
    } else if (score === best) {
      candidates.push(index)
    }
  }

  return pick(candidates.length > 0 ? candidates : moves, random)
}

/**
 * Scores a position for `player`: every line that only contains their marks is
 * worth the square of its mark count, and every open line of the opponent is
 * worth the same in negative. Cheap enough to run on a 10x10 board per move.
 */
export function evaluateBoard(
  board: Board,
  player: Player,
  size: BoardSize = THREE_BY_THREE,
): number {
  let score = 0
  for (const line of getWinLines(size)) {
    let mine = 0
    let theirs = 0
    for (const index of line) {
      const value = board[index]
      if (value === player) mine += 1
      else if (value !== null) theirs += 1
    }
    if (theirs === 0) score += mine * mine
    else if (mine === 0) score -= theirs * theirs
  }
  return score
}

/**
 * Evaluates a position from the point of view of `aiPlayer`.
 * A win is worth `WIN_SCORE - depth` (faster wins are better) and a loss is
 * worth `depth - LOSS_SCORE` (slower losses are better).
 *
 * @param playerToMove the symbol that is allowed to move in the given position.
 * @param limit         plies to search before the heuristic takes over.
 */
export function minimax(
  board: Board,
  aiPlayer: Player,
  playerToMove: Player,
  depth = 0,
  size: BoardSize = THREE_BY_THREE,
  limit = Infinity,
): number {
  const winner = getWinner(board, size)
  if (winner !== null) {
    // A win is better the sooner it happens, a loss is better the later.
    return winner === aiPlayer ? WIN_SCORE - depth : LOSS_SCORE + depth
  }
  if (isBoardFull(board)) return 0
  if (depth >= limit) return evaluateBoard(board, aiPlayer, size) / HEURISTIC_SCALE

  const key = memoKey(board, size, aiPlayer, playerToMove, depth, limit)
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  let best: number
  if (playerToMove === aiPlayer) {
    best = -Infinity
    for (const index of getAvailableMoves(board)) {
      const value = minimax(
        makeMove(board, index, playerToMove, size),
        aiPlayer,
        opponentOf(playerToMove),
        depth + 1,
        size,
        limit,
      )
      if (value > best) best = value
    }
  } else {
    best = Infinity
    for (const index of getAvailableMoves(board)) {
      const value = minimax(
        makeMove(board, index, playerToMove, size),
        aiPlayer,
        opponentOf(playerToMove),
        depth + 1,
        size,
        limit,
      )
      if (value < best) best = value
    }
  }

  cacheValue(key, best)
  return best
}

/**
 * Finds the index where `player` would immediately win, or `null`.
 * The board is never modified.
 */
export function findImmediateWin(
  board: Board,
  player: Player,
  size: BoardSize = THREE_BY_THREE,
): number | null {
  if (getGameStatus(board, size) !== 'playing') return null
  for (const index of getAvailableMoves(board)) {
    const candidate = makeMove(board, index, player, size)
    if (getWinningCombination(candidate, size) !== null) return index
  }
  return null
}

/** Exposed for tests: the deterministic minimax value of a position. */
export function evaluatePosition(
  board: Board,
  aiPlayer: Player,
  size: BoardSize = THREE_BY_THREE,
): number {
  const winner = getWinner(board, size)
  if (winner !== null) return winner === aiPlayer ? WIN_SCORE : LOSS_SCORE
  if (isBoardFull(board)) return 0
  // X always starts, so an odd number of empty cells means it is X's turn.
  const playerToMove = getAvailableMoves(board).length % 2 === 1 ? 'X' : 'O'
  return minimax(board, aiPlayer, playerToMove, 0, size)
}

/** Exposed for tests: stable key of a board position. */
export { boardKey }

/** The middle cell (or the one just past the middle on an even board). */
function centreIndex(size: BoardSize): number {
  return Math.floor(size.rows / 2) * size.cols + Math.floor(size.cols / 2)
}

function cornerIndices(size: BoardSize): number[] {
  const last = size.rows * size.cols - 1
  return [0, size.cols - 1, last - size.cols + 1, last]
}

function pick<T>(items: T[], random: RandomSource): T {
  const index = Math.floor(clampRandom(random()) * items.length)
  return items[Math.min(index, items.length - 1)]
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value >= 1) return 0.999999
  return value
}
