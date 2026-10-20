import { describe, expect, it } from 'vitest'
import {
  createInitialGameState,
  gameReducer,
  getComputerSymbol,
  getPlayerLabel,
  hasActiveRound,
  isComputerTurn,
  type GameState,
} from './gameReducer'
import { createInitialBoard } from './gameLogic'

function reduce(state: GameState, ...actions: Parameters<typeof gameReducer>[1][]): GameState {
  return actions.reduce(gameReducer, state)
}

describe('createInitialGameState', () => {
  it('starts an empty board with X to move', () => {
    const state = createInitialGameState()
    expect(state.board).toHaveLength(9)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.currentPlayer).toBe('X')
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.roundNumber).toBe(1)
    expect(state.movesPlayed).toBe(0)
  })
})

describe('playMove', () => {
  it('places the symbol and switches the turn', () => {
    const state = reduce(createInitialGameState(), {
      type: 'playMove',
      index: 0,
      player: 'X',
    })
    expect(state.board[0]).toBe('X')
    expect(state.currentPlayer).toBe('O')
    expect(state.movesPlayed).toBe(1)
    expect(state.status).toBe('playing')
  })

  it('rejects a move on an occupied cell', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 0, player: 'X' },
      { type: 'playMove', index: 0, player: 'O' },
    )
    expect(state.board[0]).toBe('X')
    expect(state.movesPlayed).toBe(1)
  })

  it('rejects a move when it is not the player turn', () => {
    const state = reduce(createInitialGameState(), { type: 'playMove', index: 3, player: 'O' })
    expect(state.board[3]).toBeNull()
    expect(state.movesPlayed).toBe(0)
  })

  it('rejects out of range indexes', () => {
    const state = reduce(createInitialGameState(), { type: 'playMove', index: 42, player: 'X' })
    expect(state.movesPlayed).toBe(0)
  })

  it('rejects a move after the game has been won', () => {
    let state = createInitialGameState()
    for (const [index, player] of [
      [0, 'X'],
      [3, 'O'],
      [1, 'X'],
      [4, 'O'],
      [2, 'X'],
    ] as const) {
      state = gameReducer(state, { type: 'playMove', index, player })
    }
    expect(state.status).toBe('won')
    expect(state.winner).toBe('X')
    expect(state.winningCombination).toEqual([0, 1, 2])

    const after = gameReducer(state, { type: 'playMove', index: 5, player: 'O' })
    expect(after).toBe(state)
  })

  it('ignores a move that belongs to a stale round', () => {
    const state = reduce(createInitialGameState(), {
      type: 'playMove',
      index: 0,
      player: 'X',
      roundId: 999,
    })
    expect(state.movesPlayed).toBe(0)
  })

  it('accepts a move that belongs to the current round', () => {
    const state = reduce(createInitialGameState(), {
      type: 'playMove',
      index: 0,
      player: 'X',
      roundId: 1,
    })
    expect(state.board[0]).toBe('X')
  })
})

describe('scoring', () => {
  it('counts a player win exactly once', () => {
    let state = createInitialGameState()
    for (const [index, player] of [
      [0, 'X'],
      [3, 'O'],
      [1, 'X'],
      [4, 'O'],
      [2, 'X'],
    ] as const) {
      state = gameReducer(state, { type: 'playMove', index, player })
    }

    expect(state.stats.pvc.playerWins).toBe(1)
    expect(state.stats.pvc.computerWins).toBe(0)
    expect(state.stats.pvc.draws).toBe(0)
    expect(state.stats.pvc.rounds).toBe(1)
    expect(state.history).toHaveLength(1)
    expect(state.history[0].winnerLabel).toBe('You')
    expect(state.history[0].result).toBe('X')

    // Further moves are rejected, so the score cannot increase twice.
    const after = gameReducer(state, { type: 'playMove', index: 5, player: 'O' })
    expect(after.stats.pvc.playerWins).toBe(1)
    expect(after.history).toHaveLength(1)
  })

  it('counts a computer win', () => {
    let state = createInitialGameState()
    for (const [index, player] of [
      [4, 'X'],
      [0, 'O'],
      [5, 'X'],
      [1, 'O'],
      [6, 'X'],
      [2, 'O'],
    ] as const) {
      state = gameReducer(state, { type: 'playMove', index, player })
    }
    expect(state.status).toBe('won')
    expect(state.winner).toBe('O')
    expect(state.stats.pvc.computerWins).toBe(1)
    expect(state.history[0].winnerLabel).toBe('Computer')
  })

  it('counts a draw', () => {
    let state = createInitialGameState()
    for (const [index, player] of [
      [0, 'X'],
      [1, 'O'],
      [2, 'X'],
      [4, 'O'],
      [3, 'X'],
      [5, 'O'],
      [7, 'X'],
      [6, 'O'],
      [8, 'X'],
    ] as const) {
      state = gameReducer(state, { type: 'playMove', index, player })
    }
    expect(state.status).toBe('draw')
    expect(state.stats.pvc.draws).toBe(1)
    expect(state.stats.pvc.rounds).toBe(1)
    expect(state.history[0].result).toBe('draw')
  })

  it('keeps the two player statistics separate from the computer statistics', () => {
    let state = reduce(createInitialGameState(), { type: 'setMode', mode: 'pvp' })
    for (const [index, player] of [
      [0, 'X'],
      [3, 'O'],
      [1, 'X'],
      [4, 'O'],
      [2, 'X'],
    ] as const) {
      state = gameReducer(state, { type: 'playMove', index, player })
    }

    expect(state.stats.pvp.xWins).toBe(1)
    expect(state.stats.pvp.rounds).toBe(1)
    expect(state.stats.pvc.rounds).toBe(0)
    expect(state.history[0].winnerLabel).toBe('Player 1')
  })

  it('keeps the history limited to the latest 20 rounds', () => {
    let state = createInitialGameState()
    for (let round = 0; round < 25; round += 1) {
      state = reduce(
        state,
        { type: 'newRound' },
        { type: 'playMove', index: 0, player: 'X' },
        { type: 'playMove', index: 3, player: 'O' },
        { type: 'playMove', index: 1, player: 'X' },
        { type: 'playMove', index: 4, player: 'O' },
        { type: 'playMove', index: 2, player: 'X' },
      )
    }
    expect(state.history.length).toBeLessThanOrEqual(20)
    expect(state.stats.pvc.rounds).toBe(25)
  })
})

describe('round and match management', () => {
  it('newRound resets the board and invalidates the previous round id', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 4, player: 'X' },
      { type: 'newRound' },
    )
    expect(state.board).toEqual(createInitialBoard())
    expect(state.movesPlayed).toBe(0)
    expect(state.currentPlayer).toBe('X')
    expect(state.roundId).toBe(2)
    expect(state.status).toBe('playing')
  })

  it('newMatch clears the scores and the history', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 0, player: 'X' },
      { type: 'playMove', index: 1, player: 'O' },
      { type: 'playMove', index: 2, player: 'X' },
      { type: 'newMatch' },
    )
    expect(state.stats.pvc.rounds).toBe(0)
    expect(state.stats.pvc.playerWins).toBe(0)
    expect(state.history).toHaveLength(0)
    expect(state.roundNumber).toBe(1)
    expect(state.roundId).toBe(2)
  })

  it('switching the mode discards the current board', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 4, player: 'X' },
      { type: 'setMode', mode: 'pvp' },
    )
    expect(state.mode).toBe('pvp')
    expect(state.board).toEqual(createInitialBoard())
    expect(state.movesPlayed).toBe(0)
    expect(state.currentPlayer).toBe('X')
  })

  it('changing the human symbol discards the current board', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 4, player: 'X' },
      { type: 'setHumanSymbol', symbol: 'O' },
    )
    expect(state.humanSymbol).toBe('O')
    expect(state.board).toEqual(createInitialBoard())
    expect(state.movesPlayed).toBe(0)
  })

  it('resetStats clears the scores and the history but keeps the board', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'playMove', index: 0, player: 'X' },
      { type: 'playMove', index: 1, player: 'O' },
      { type: 'playMove', index: 2, player: 'X' },
      { type: 'resetStats' },
    )
    expect(state.stats.pvc.playerWins).toBe(0)
    expect(state.stats.pvc.rounds).toBe(0)
    expect(state.history).toHaveLength(0)
    expect(state.board[0]).toBe('X')
  })

  it('updates the difficulty and the sound preference', () => {
    const state = reduce(
      createInitialGameState(),
      { type: 'setDifficulty', difficulty: 'hard' },
      { type: 'setSoundEnabled', enabled: true },
    )
    expect(state.difficulty).toBe('hard')
    expect(state.soundEnabled).toBe(true)
  })
})

describe('selectors', () => {
  it('derives the computer symbol from the human symbol', () => {
    const state = createInitialGameState()
    expect(getComputerSymbol(state)).toBe('O')
    expect(getComputerSymbol({ ...state, humanSymbol: 'O' })).toBe('X')
  })

  it('knows when the computer has to move', () => {
    const state = createInitialGameState()
    expect(isComputerTurn(state)).toBe(false)
    expect(isComputerTurn({ ...state, currentPlayer: 'O' })).toBe(true)
    expect(isComputerTurn({ ...state, currentPlayer: 'O', status: 'won' })).toBe(false)
    expect(isComputerTurn({ ...state, mode: 'pvp', currentPlayer: 'O' })).toBe(false)
  })

  it('knows when a round is in progress', () => {
    const state = createInitialGameState()
    expect(hasActiveRound(state)).toBe(false)
    expect(hasActiveRound({ ...state, movesPlayed: 1 })).toBe(true)
    expect(hasActiveRound({ ...state, movesPlayed: 1, status: 'draw' })).toBe(false)
  })

  it('labels the players depending on the mode', () => {
    const state = createInitialGameState()
    expect(getPlayerLabel(state, 'X')).toBe('You')
    expect(getPlayerLabel(state, 'O')).toBe('Computer')
    expect(getPlayerLabel({ ...state, mode: 'pvp' }, 'X')).toBe('Player 1')
    expect(getPlayerLabel({ ...state, mode: 'pvp' }, 'O')).toBe('Player 2')
  })
})
