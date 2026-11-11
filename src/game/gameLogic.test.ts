import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  InvalidMoveError,
  WINNING_COMBINATIONS,
  canPlayAt,
  createInitialBoard,
  generateWinLines,
  getAvailableMoves,
  getGameStatus,
  getWinLength,
  getWinner,
  getWinningCombination,
  isBoardFull,
  isValidIndex,
  makeMove,
  normaliseBoardSize,
} from './gameLogic'
import type { Board, BoardSize, Cell, Player } from './types'

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

describe('dynamic board sizes', () => {
  const fourByFour = normaliseBoardSize(4, 4) as BoardSize
  const tenByTen = normaliseBoardSize(10, 10) as BoardSize

  function sizedBoard(size: BoardSize, marks: Record<number, Player> = {}): Board {
    const board = createInitialBoard(size).slice() as Cell[]
    for (const [index, player] of Object.entries(marks)) board[Number(index)] = player
    return board
  }

  it('derives the win length from the grid', () => {
    expect(getWinLength(3, 3)).toBe(3)
    expect(getWinLength(4, 4)).toBe(4)
    expect(getWinLength(7, 7)).toBe(4)
    expect(getWinLength(8, 8)).toBe(5)
    expect(getWinLength(10, 10)).toBe(5)
    expect(getWinLength(3, 10)).toBe(5)
  })

  it('accepts only 3-10 dimensions inside the 100 cell budget', () => {
    expect(normaliseBoardSize(3, 3)).toEqual({ rows: 3, cols: 3, winLength: 3 })
    expect(normaliseBoardSize(9, 10)).toEqual({ rows: 9, cols: 10, winLength: 5 })
    expect(normaliseBoardSize(2, 3)).toBeNull()
    expect(normaliseBoardSize(3, 11)).toBeNull()
    expect(normaliseBoardSize(10.5, 4)).toBeNull()
    expect(normaliseBoardSize(Number.NaN, 4)).toBeNull()
  })

  it('generates the classic eight lines for 3x3', () => {
    expect(generateWinLines(3, 3, 3)).toHaveLength(8)
    expect(generateWinLines(3, 3, 3)).toEqual(WINNING_COMBINATIONS.map((line) => [...line]))
  })

  it('generates rows, columns and both diagonals for 4x4', () => {
    const lines = generateWinLines(4, 4, 4)
    expect(lines).toHaveLength(10)
    expect(lines).toContainEqual([0, 1, 2, 3])
    expect(lines).toContainEqual([0, 4, 8, 12])
    expect(lines).toContainEqual([3, 6, 9, 12])
  })

  it('creates an empty board of the requested shape', () => {
    expect(createInitialBoard(fourByFour)).toHaveLength(16)
    expect(createInitialBoard(tenByTen)).toHaveLength(100)
    expect(createInitialBoard(tenByTen).every((cell) => cell === null)).toBe(true)
  })

  it('detects a row win on a 4x4 board', () => {
    const board = sizedBoard(fourByFour, { 4: 'X', 5: 'X', 6: 'X', 7: 'X' })
    expect(getWinner(board, fourByFour)).toBe('X')
    expect(getWinningCombination(board, fourByFour)).toEqual([4, 5, 6, 7])
    expect(getGameStatus(board, fourByFour)).toBe('won')
  })

  it('needs five in a line on a 10x10 board', () => {
    const four = sizedBoard(tenByTen, { 40: 'O', 41: 'O', 42: 'O', 43: 'O' })
    expect(getWinner(four, tenByTen)).toBeNull()

    const five = sizedBoard(tenByTen, { 40: 'O', 41: 'O', 42: 'O', 43: 'O', 44: 'O' })
    expect(getWinner(five, tenByTen)).toBe('O')
  })

  it('detects both diagonals on a 10x10 board', () => {
    const falling = sizedBoard(tenByTen, { 0: 'X', 11: 'X', 22: 'X', 33: 'X', 44: 'X' })
    expect(getWinner(falling, tenByTen)).toBe('X')

    const rising = sizedBoard(tenByTen, { 9: 'O', 18: 'O', 27: 'O', 36: 'O', 45: 'O' })
    expect(getWinner(rising, tenByTen)).toBe('O')
  })

  it('detects a column win on a tall board', () => {
    const board = sizedBoard(tenByTen, { 5: 'X', 15: 'X', 25: 'X', 35: 'X', 45: 'X' })
    expect(getWinner(board, tenByTen)).toBe('X')
  })

  it('reports a draw on a full 4x4 board with no line', () => {
    const board = sizedBoard(fourByFour, {
      0: 'X', 1: 'O', 2: 'X', 3: 'O',
      4: 'X', 5: 'O', 6: 'X', 7: 'O',
      8: 'O', 9: 'X', 10: 'O', 11: 'X',
      12: 'O', 13: 'X', 14: 'O', 15: 'X',
    })
    expect(getWinner(board, fourByFour)).toBeNull()
    expect(getGameStatus(board, fourByFour)).toBe('draw')
  })

  it('rejects moves outside the board of a 4x4 grid', () => {
    const board = createInitialBoard(fourByFour)
    expect(() => makeMove(board, 16, 'X', fourByFour)).toThrow(InvalidMoveError)
    expect(() => makeMove(board, 15, 'X', fourByFour)).not.toThrow()
  })

  it('rejects moves after a win on a big board', () => {
    const board = sizedBoard(tenByTen, { 0: 'X', 11: 'X', 22: 'X', 33: 'X', 44: 'X' })
    expect(() => makeMove(board, 99, 'O', tenByTen)).toThrow(InvalidMoveError)
  })
})
