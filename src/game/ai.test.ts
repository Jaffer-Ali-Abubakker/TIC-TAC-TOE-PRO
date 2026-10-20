import { describe, expect, it } from 'vitest'
import {
  chooseEasyMove,
  chooseHardMove,
  chooseMediumMove,
  chooseMove,
  evaluatePosition,
  findImmediateWin,
  minimax,
} from './ai'
import {
  boardKey,
  createInitialBoard,
  getAvailableMoves,
  getGameStatus,
  getWinner,
  makeMove,
} from './gameLogic'
import type { Board, Cell, Player } from './types'
import { opponentOf } from './types'

function boardWith(marks: Record<number, Player>): Board {
  const board = createInitialBoard().slice() as Cell[]
  for (const [index, player] of Object.entries(marks)) {
    board[Number(index)] = player
  }
  return board
}

/** Enumerates every board position that can be reached by legal play. */
function enumerateReachableStates(): Array<{ board: Board; playerToMove: Player }> {
  const states: Array<{ board: Board; playerToMove: Player }> = []
  const seen = new Set<string>()

  const visit = (board: Board, playerToMove: Player) => {
    const key = `${boardKey(board)}|${playerToMove}`
    if (seen.has(key)) return
    seen.add(key)
    states.push({ board, playerToMove })

    if (getGameStatus(board) !== 'playing') return

    for (const index of getAvailableMoves(board)) {
      visit(makeMove(board, index, playerToMove), opponentOf(playerToMove))
    }
  }

  visit(createInitialBoard(), 'X')
  return states
}

describe('chooseMove - shared contract', () => {
  it('returns null for a finished game', () => {
    const won = boardWith({ 0: 'X', 1: 'X', 2: 'X' })
    const drawn = boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'X', 4: 'O', 5: 'O', 6: 'O', 7: 'X', 8: 'X' })

    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      expect(chooseMove(won, 'O', difficulty)).toBeNull()
      expect(chooseMove(drawn, 'O', difficulty)).toBeNull()
    }
  })

  it('never mutates the board', () => {
    const board = boardWith({ 0: 'X', 4: 'O' })
    const snapshot = board.slice()
    chooseMove(board, 'X', 'easy')
    chooseMove(board, 'X', 'medium')
    chooseMove(board, 'X', 'hard')
    expect(board).toEqual(snapshot)
  })
})

describe('easy difficulty', () => {
  it('always returns a legal move', () => {
    const boards = [
      createInitialBoard(),
      boardWith({ 0: 'X' }),
      boardWith({ 0: 'X', 4: 'O' }),
      boardWith({ 0: 'X', 1: 'O', 2: 'X', 3: 'X', 4: 'O', 5: 'O', 6: 'O', 7: 'X' }),
    ]

    for (const board of boards) {
      const available = getAvailableMoves(board)
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const move = chooseEasyMove(board)
        expect(move).not.toBeNull()
        expect(available).toContain(move)
      }
    }
  })

  it('can pick any of the available cells', () => {
    const board = createInitialBoard()
    const picked = new Set<number | null>()
    for (let attempt = 0; attempt < 200; attempt += 1) {
      picked.add(chooseEasyMove(board))
    }
    expect(picked.size).toBeGreaterThan(1)
    for (const move of picked) {
      expect(getAvailableMoves(board)).toContain(move)
    }
  })

  it('respects an injected random source', () => {
    const board = createInitialBoard()
    expect(chooseEasyMove(board, () => 0)).toBe(0)
    expect(chooseEasyMove(board, () => 0.99)).toBe(8)
  })
})

describe('medium difficulty', () => {
  it('takes an immediate winning move', () => {
    // O can complete the top row at index 2.
    const board = boardWith({ 0: 'O', 1: 'O', 3: 'X' })
    expect(findImmediateWin(board, 'O')).toBe(2)
    expect(chooseMediumMove(board, 'O')).toBe(2)
  })

  it('takes the win even when blocking would also be possible', () => {
    // O wins at 2 while X threatens 3 - the win must be preferred.
    const board = boardWith({ 0: 'O', 1: 'O', 4: 'X' })
    expect(chooseMediumMove(board, 'O')).toBe(2)
  })

  it('blocks an immediate opponent win when required', () => {
    // X threatens index 2, O cannot win immediately and must block.
    const board = boardWith({ 0: 'X', 1: 'X', 4: 'O' })
    expect(findImmediateWin(board, 'X')).toBe(2)
    expect(chooseMediumMove(board, 'O')).toBe(2)
  })

  it('prefers the center when it is free', () => {
    expect(chooseMediumMove(createInitialBoard(), 'X')).toBe(4)
  })

  it('prefers a corner when the center is taken', () => {
    const board = boardWith({ 4: 'X' })
    const move = chooseMediumMove(board, 'O')
    expect(move).not.toBeNull()
    expect([0, 2, 6, 8]).toContain(move)
  })

  it('returns a legal move in every reachable position', () => {
    for (const { board, playerToMove } of enumerateReachableStates()) {
      if (getGameStatus(board) !== 'playing') continue
      const move = chooseMediumMove(board, playerToMove)
      expect(move).not.toBeNull()
      expect(getAvailableMoves(board)).toContain(move)
    }
  })
})

describe('hard difficulty', () => {
  it('wins when a forced win is available', () => {
    const board = boardWith({ 0: 'O', 1: 'O', 4: 'X' })
    expect(chooseHardMove(board, 'O')).toBe(2)
  })

  it('avoids a forced loss when a safe move exists', () => {
    // X threatens index 2 and nothing else: the only non losing move is 2.
    const board = boardWith({ 0: 'X', 1: 'X', 4: 'O' })
    expect(chooseHardMove(board, 'O')).toBe(2)
  })

  it('never leaves an immediate winning reply to the opponent', () => {
    for (const { board, playerToMove } of enumerateReachableStates()) {
      if (getGameStatus(board) !== 'playing') continue
      const move = chooseHardMove(board, playerToMove)
      expect(move).not.toBeNull()
      const after = makeMove(board, move as number, playerToMove)
      const reply = findImmediateWin(after, opponentOf(playerToMove))
      // The opponent may only have an immediate win when the position was
      // already lost - which cannot happen when the AI plays optimally.
      if (reply !== null) {
        expect(evaluatePosition(board, playerToMove)).toBeLessThan(0)
      }
    }
  })

  it('plays optimally in every reachable position', () => {
    for (const { board, playerToMove } of enumerateReachableStates()) {
      if (getGameStatus(board) !== 'playing') continue

      const move = chooseHardMove(board, playerToMove) as number
      const chosen = minimax(
        makeMove(board, move, playerToMove),
        playerToMove,
        opponentOf(playerToMove),
        1,
      )

      const best = Math.max(
        ...getAvailableMoves(board).map((index) =>
          minimax(
            makeMove(board, index, playerToMove),
            playerToMove,
            opponentOf(playerToMove),
            1,
          ),
        ),
      )

      expect(chosen).toBe(best)
    }
  })

  it('handles both possible computer symbols', () => {
    const asX = chooseHardMove(createInitialBoard(), 'X')
    const asO = chooseHardMove(createInitialBoard(), 'O')
    expect(asX).not.toBeNull()
    expect(asO).not.toBeNull()
    expect(getAvailableMoves(createInitialBoard())).toContain(asX)
    expect(getAvailableMoves(createInitialBoard())).toContain(asO)
  })

  it('never loses in any legal reachable game, as X', () => {
    assertNeverLoses('X')
  })

  it('never loses in any legal reachable game, as O', () => {
    assertNeverLoses('O')
  })
})

/**
 * Plays every possible opponent reply against the hard AI and asserts that
 * the AI is never the loser.
 */
function assertNeverLoses(aiPlayer: Player): void {
  const seen = new Set<string>()

  const visit = (board: Board, playerToMove: Player) => {
    const key = `${boardKey(board)}|${playerToMove}`
    if (seen.has(key)) return
    seen.add(key)

    const status = getGameStatus(board)
    if (status !== 'playing') {
      if (status === 'won') {
        expect(getWinner(board)).toBe(aiPlayer)
      }
      return
    }

    if (playerToMove === aiPlayer) {
      const move = chooseHardMove(board, aiPlayer)
      expect(move).not.toBeNull()
      visit(makeMove(board, move as number, aiPlayer), opponentOf(aiPlayer))
      return
    }

    for (const index of getAvailableMoves(board)) {
      visit(makeMove(board, index, playerToMove), opponentOf(playerToMove))
    }
  }

  visit(createInitialBoard(), 'X')
}
