import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  InvalidMoveError,
  WINNING_COMBINATIONS,
  canPlayAt,
  createInitialBoard,
  getAvailableMoves,
  getGameStatus,
  getWinner,
  getWinningCombination,
  isBoardFull,
  isValidIndex,
  makeMove,
} from './gameLogic'
import type { Board, Cell, Player } from './types'

function boardWith(marks: Record<number, Player>): Board {
  const board = createInitialBoard().slice() as Cell[]
  for (const [index, player] of Object.entries(marks)) {
    board[Number(index)] = player
  }
  return board
}

/** Plays a sequence of moves and returns the resulting board. */
function play(moves: Array<[number, Player]>): Board {
  return moves.reduce<Board>((board, [index, player]) => makeMove(board, index, player), createInitialBoard())
}

describe('createInitialBoard', () => {
  it('creates a board of nine empty cells', () => {
    const board = createInitialBoard()
    expect(board).toHaveLength(BOARD_SIZE)
    expect(board.every((cell) => cell === null)).toBe(true)
  })

  it('returns a new array on every call', () => {
    expect(createInitialBoard()).not.toBe(createInitialBoard())
  })
})

describe('getWinner', () => {
  const winningLines = [
    { name: 'top row', cells: [0, 1, 2] },
    { name: 'middle row', cells: [3, 4, 5] },
    { name: 'bottom row', cells: [6, 7, 8] },
    { name: 'left column', cells: [0, 3, 6] },
    { name: 'middle column', cells: [1, 4, 7] },
    { name: 'right column', cells: [2, 5, 8] },
    { name: 'main diagonal', cells: [0, 4, 8] },
    { name: 'anti diagonal', cells: [2, 4, 6] },
  ]

  for (const line of winningLines) {
    for (const winner of ['X', 'O'] as const) {
      it(`detects ${winner} winning on the ${line.name}`, () => {
        const marks: Record<number, Player> = {}
        line.cells.forEach((index) => {
          marks[index] = winner
        })
        expect(getWinner(boardWith(marks))).toBe(winner)
      })
    }
  }

  it('returns null when nobody has won', () => {
    expect(getWinner(createInitialBoard())).toBeNull()
    expect(getWinner(boardWith({ 0: 'X', 1: 'O', 2: 'X' }))).toBeNull()
  })

  it('exposes exactly eight winning combinations', () => {
    expect(WINNING_COMBINATIONS).toHaveLength(8)
  })
})

describe('getWinningCombination', () => {
  it('returns the indexes of the winning line', () => {
    const board = boardWith({ 0: 'X', 4: 'X', 8: 'X' })
    expect(getWinningCombination(board)).toEqual([0, 4, 8])
  })

  it('returns null when there is no winning line', () => {
    expect(getWinningCombination(createInitialBoard())).toBeNull()
  })

  it('does not treat mixed lines as a win', () => {
    expect(getWinningCombination(boardWith({ 0: 'X', 1: 'O', 2: 'X' }))).toBeNull()
  })
})

describe('isBoardFull', () => {
  it('is false for an empty board', () => {
    expect(isBoardFull(createInitialBoard())).toBe(false)
  })

  it('is true once every cell is taken', () => {
    const board = boardWith({ 0: 'X', 1: 'X', 2: 'O', 3: 'O', 4: 'X', 5: 'X', 6: 'O', 7: 'O', 8: 'X' })
    expect(isBoardFull(board)).toBe(true)
  })
})

describe('getGameStatus', () => {
  it('is "playing" for an empty board', () => {
    expect(getGameStatus(createInitialBoard())).toBe('playing')
  })

  it('is "won" when a line is complete', () => {
    expect(getGameStatus(boardWith({ 0: 'X', 1: 'X', 2: 'X' }))).toBe('won')
  })

  it('is "draw" for a full board without a winner', () => {
    const board = boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'X', 4: 'O', 5: 'O', 6: 'O', 7: 'X', 8: 'X' })
    expect(getWinner(board)).toBeNull()
    expect(getGameStatus(board)).toBe('draw')
  })

  it('reports a win even when the board is also full', () => {
    // X wins on the bottom row while the board is completely full.
    const board = boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'O', 4: 'X', 5: 'O', 6: 'O', 7: 'X', 8: 'X' })
    expect(isBoardFull(board)).toBe(true)
    expect(getGameStatus(board)).toBe('won')
    expect(getWinner(board)).toBe('X')
  })
})

describe('getAvailableMoves', () => {
  it('returns all indexes for an empty board', () => {
    expect(getAvailableMoves(createInitialBoard())).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('excludes occupied cells', () => {
    expect(getAvailableMoves(boardWith({ 0: 'X', 4: 'O', 8: 'X' }))).toEqual([1, 2, 3, 5, 6, 7])
  })

  it('returns an empty list for a full board', () => {
    const board = boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'X', 4: 'O', 5: 'O', 6: 'O', 7: 'X', 8: 'X' })
    expect(getAvailableMoves(board)).toEqual([])
  })
})

describe('isValidIndex', () => {
  it('accepts indexes 0 to 8', () => {
    for (let index = 0; index < 9; index += 1) {
      expect(isValidIndex(index)).toBe(true)
    }
  })

  it('rejects out of range and fractional indexes', () => {
    expect(isValidIndex(-1)).toBe(false)
    expect(isValidIndex(9)).toBe(false)
    expect(isValidIndex(1.5)).toBe(false)
    expect(isValidIndex(Number.NaN)).toBe(false)
  })
})

describe('makeMove', () => {
  it('places the symbol on an empty cell', () => {
    const board = makeMove(createInitialBoard(), 4, 'X')
    expect(board[4]).toBe('X')
  })

  it('does not mutate the original board', () => {
    const original = createInitialBoard()
    const next = makeMove(original, 0, 'X')
    expect(original[0]).toBeNull()
    expect(next).not.toBe(original)
    expect(original).toHaveLength(9)
  })

  it('rejects out of range indexes', () => {
    expect(() => makeMove(createInitialBoard(), -1, 'X')).toThrow(InvalidMoveError)
    expect(() => makeMove(createInitialBoard(), 9, 'X')).toThrow(InvalidMoveError)
    expect(() => makeMove(createInitialBoard(), 1.2, 'X')).toThrow(InvalidMoveError)
  })

  it('rejects moves on an occupied cell', () => {
    const board = makeMove(createInitialBoard(), 0, 'X')
    expect(() => makeMove(board, 0, 'O')).toThrow(InvalidMoveError)
  })

  it('rejects moves after the game has been won', () => {
    const board = boardWith({ 0: 'X', 1: 'X', 2: 'X' })
    expect(() => makeMove(board, 3, 'O')).toThrow(InvalidMoveError)
  })

  it('rejects moves after a draw', () => {
    const board = boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'X', 4: 'O', 5: 'O', 6: 'O', 7: 'X', 8: 'X' })
    expect(() => makeMove(board, 3, 'O')).toThrow(InvalidMoveError)
  })

  it('rejects invalid players', () => {
    expect(() => makeMove(createInitialBoard(), 0, 'Z' as Player)).toThrow(InvalidMoveError)
  })
})

describe('canPlayAt', () => {
  it('is true for an empty cell of a running game', () => {
    expect(canPlayAt(createInitialBoard(), 0)).toBe(true)
  })

  it('is false for occupied cells, finished games and invalid indexes', () => {
    const board = makeMove(createInitialBoard(), 0, 'X')
    expect(canPlayAt(board, 0)).toBe(false)
    expect(canPlayAt(board, 5)).toBe(true)
    expect(canPlayAt(board, 12)).toBe(false)
  })
})

describe('game flow', () => {
  it('alternates cleanly and detects a diagonal win', () => {
    const board = play([
      [0, 'X'],
      [1, 'O'],
      [4, 'X'],
      [2, 'O'],
      [8, 'X'],
    ])
    expect(getWinner(board)).toBe('X')
    expect(getWinningCombination(board)).toEqual([0, 4, 8])
    expect(getGameStatus(board)).toBe('won')
  })

  it('reaches a draw without a winner', () => {
    const board = play([
      [0, 'X'],
      [1, 'O'],
      [2, 'X'],
      [4, 'O'],
      [3, 'X'],
      [5, 'O'],
      [7, 'X'],
      [6, 'O'],
      [8, 'X'],
    ])
    expect(getWinner(board)).toBeNull()
    expect(getGameStatus(board)).toBe('draw')
  })
})
