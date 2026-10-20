import {
  CENTER_INDEX,
  CORNER_INDICES,
  boardKey,
  getAvailableMoves,
  getGameStatus,
  getWinningCombination,
  getWinner,
  isBoardFull,
  makeMove,
} from './gameLogic'
import type { Board, Difficulty, Player } from './types'
import { opponentOf } from './types'

/** Injectable randomness so the AI can be tested deterministically. */
export type RandomSource = () => number

export const WIN_SCORE = 10
export const LOSS_SCORE = -10

const MAX_MEMO_ENTRIES = 200_000

/**
 * Memoisation cache for the minimax search.
 * A position's value is fully determined by the board, the symbol of the
 * computer, the symbol to move and the depth of the position.
 */
const memo = new Map<string, number>()

function memoKey(
  board: Board,
  aiPlayer: Player,
  playerToMove: Player,
  depth: number,
): string {
  return `${boardKey(board)}|${aiPlayer}|${playerToMove}|${depth}`
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
): number | null {
  if (getGameStatus(board) !== 'playing') return null

  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  switch (difficulty) {
    case 'easy':
      return chooseEasyMove(board, random)
    case 'medium':
      return chooseMediumMove(board, player, random)
    case 'hard':
      return chooseHardMove(board, player, random)
    default:
      return null
  }
}

/** Easy: picks a random legal cell. */
export function chooseEasyMove(board: Board, random: RandomSource = Math.random): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null
  const index = Math.floor(clampRandom(random()) * moves.length)
  return moves[Math.min(index, moves.length - 1)]
}

/**
 * Medium: win if possible, otherwise block the opponent, then prefer the
 * center, then a corner, then any remaining legal cell at random.
 */
export function chooseMediumMove(
  board: Board,
  player: Player,
  random: RandomSource = Math.random,
): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  const winning = findImmediateWin(board, player)
  if (winning !== null) return winning

  const blocking = findImmediateWin(board, opponentOf(player))
  if (blocking !== null) return blocking

  if (moves.includes(CENTER_INDEX)) return CENTER_INDEX

  const corner = CORNER_INDICES.find((index) => moves.includes(index))
  if (corner !== undefined) return corner

  const index = Math.floor(clampRandom(random()) * moves.length)
  return moves[Math.min(index, moves.length - 1)]
}

/**
 * Hard: minimax search. Never loses against an optimal opponent, prefers
 * quick wins and slow losses, and only mutates copies of the board.
 */
export function chooseHardMove(
  board: Board,
  player: Player,
  random: RandomSource = Math.random,
): number | null {
  const moves = getAvailableMoves(board)
  if (moves.length === 0) return null

  const nextPlayer = opponentOf(player)
  const scored = moves.map((index) => ({
    index,
    score: minimax(makeMove(board, index, player), player, nextPlayer, 1),
  }))

  const best = Math.max(...scored.map((entry) => entry.score))
  const candidates = scored.filter((entry) => entry.score === best).map((entry) => entry.index)

  if (candidates.length === 1) return candidates[0]
  // Controlled randomness between equally optimal moves keeps repeated games
  // from feeling scripted while never sacrificing optimality.
  const index = Math.floor(clampRandom(random()) * candidates.length)
  return candidates[Math.min(index, candidates.length - 1)]
}

/**
 * Evaluates a position from the point of view of `aiPlayer`.
 * A win is worth `WIN_SCORE - depth` (faster wins are better) and a loss is
 * worth `depth - LOSS_SCORE` (slower losses are better).
 *
 * @param playerToMove the symbol that is allowed to move in the given position.
 */
export function minimax(
  board: Board,
  aiPlayer: Player,
  playerToMove: Player,
  depth = 0,
): number {
  const winner = getWinner(board)
  if (winner !== null) {
    // A win is better the sooner it happens, a loss is better the later.
    return winner === aiPlayer ? WIN_SCORE - depth : LOSS_SCORE + depth
  }
  if (isBoardFull(board)) return 0

  const key = memoKey(board, aiPlayer, playerToMove, depth)
  const cached = memo.get(key)
  if (cached !== undefined) return cached

  let best: number
  if (playerToMove === aiPlayer) {
    best = -Infinity
    for (const index of getAvailableMoves(board)) {
      const value = minimax(
        makeMove(board, index, playerToMove),
        aiPlayer,
        opponentOf(playerToMove),
        depth + 1,
      )
      if (value > best) best = value
    }
  } else {
    best = Infinity
    for (const index of getAvailableMoves(board)) {
      const value = minimax(
        makeMove(board, index, playerToMove),
        aiPlayer,
        opponentOf(playerToMove),
        depth + 1,
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
export function findImmediateWin(board: Board, player: Player): number | null {
  if (getGameStatus(board) !== 'playing') return null
  for (const index of getAvailableMoves(board)) {
    const candidate = makeMove(board, index, player)
    if (getWinningCombination(candidate) !== null) return index
  }
  return null
}

/** Exposed for tests: the deterministic minimax value of a position. */
export function evaluatePosition(board: Board, aiPlayer: Player): number {
  const winner = getWinner(board)
  if (winner !== null) return winner === aiPlayer ? WIN_SCORE : LOSS_SCORE
  if (isBoardFull(board)) return 0
  // X always starts, so an odd number of empty cells means it is X's turn.
  const playerToMove = getAvailableMoves(board).length % 2 === 1 ? 'X' : 'O'
  return minimax(board, aiPlayer, playerToMove, 0)
}

/** Exposed for tests: stable key of a board position. */
export { boardKey }

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value >= 1) return 0.999999
  return value
}
