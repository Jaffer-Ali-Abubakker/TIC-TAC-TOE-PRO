import {
  createInitialBoard,
  getGameStatus,
  getWinner,
  getWinningCombination,
  makeMove,
} from './gameLogic'
import type {
  Board,
  Difficulty,
  GameMode,
  GameStatus,
  HistoryEntry,
  Player,
  RoundResult,
  Stats,
} from './types'
import { opponentOf } from './types'
import { createDefaultStats } from '../utils/storage'

/** The authoritative room snapshot produced by the database. */
export interface OnlineRoomSnapshot {
  board: readonly (Player | null)[]
  currentTurn: Player
  status: GameStatus
  winnerSymbol: Player | null
  winningCombination: number[] | null
  roundNumber: number
  movesPlayed: number
  lastMoveIndex: number | null
  version: number
  result: 'X' | 'O' | 'draw' | null
}

export interface GameState {
  mode: GameMode
  difficulty: Difficulty
  /** The symbol the human player controls in `pvc` mode. */
  humanSymbol: Player
  soundEnabled: boolean
  board: Board
  currentPlayer: Player
  status: GameStatus
  winner: Player | null
  winningCombination: number[] | null
  /** 1-based number of the round currently being played. */
  roundNumber: number
  /** Increments for every new round; used to invalidate stale AI moves. */
  roundId: number
  /** How many moves have been played in the current round. */
  movesPlayed: number
  lastMoveIndex: number | null
  stats: Stats
  history: HistoryEntry[]
  /** The symbol this browser plays in `online` mode (`null` when not seated). */
  onlineSymbol: Player | null
  /** Version of the last applied authoritative online snapshot. */
  onlineVersion: number
  /** Round number of the last online round that was counted in the stats. */
  onlineCountedRound: number
}

export type GameAction =
  | { type: 'playMove'; index: number; player: Player; roundId?: number }
  | { type: 'applyOnlineState'; snapshot: OnlineRoomSnapshot; mySymbol: Player | null }
  | { type: 'newRound' }
  | { type: 'newMatch' }
  | { type: 'setMode'; mode: GameMode }
  | { type: 'setDifficulty'; difficulty: Difficulty }
  | { type: 'setHumanSymbol'; symbol: Player }
  | { type: 'setSoundEnabled'; enabled: boolean }
  | { type: 'resetStats' }

export function createInitialGameState(): GameState {
  return {
    mode: 'pvc',
    difficulty: 'medium',
    humanSymbol: 'X',
    soundEnabled: false,
    board: createInitialBoard(),
    currentPlayer: 'X',
    status: 'playing',
    winner: null,
    winningCombination: null,
    roundNumber: 1,
    roundId: 1,
    movesPlayed: 0,
    lastMoveIndex: null,
    stats: createDefaultStats(),
    history: [],
    onlineSymbol: null,
    onlineVersion: 0,
    onlineCountedRound: 0,
  }
}

/** Label of a player from the human point of view. */
export function getPlayerLabel(state: GameState, player: Player): string {
  if (state.mode === 'pvp') {
    return player === 'X' ? 'Player 1' : 'Player 2'
  }
  if (state.mode === 'online') {
    return player === 'X' ? 'Player 1 (X)' : 'Player 2 (O)'
  }
  return player === state.humanSymbol ? 'You' : 'Computer'
}

/** Label of the computer symbol in the current mode. */
export function getComputerSymbol(state: GameState): Player {
  return opponentOf(state.humanSymbol)
}

export function isComputerTurn(state: GameState): boolean {
  return (
    state.mode === 'pvc' &&
    state.status === 'playing' &&
    state.currentPlayer === getComputerSymbol(state)
  )
}

/** True when a round has at least one move played and is not finished yet. */
export function hasActiveRound(state: GameState): boolean {
  return state.status === 'playing' && state.movesPlayed > 0
}

function startRound(state: GameState, mode: GameMode = state.mode): GameState {
  return {
    ...state,
    mode,
    board: createInitialBoard(),
    currentPlayer: 'X' as Player,
    status: 'playing' as GameStatus,
    winner: null,
    winningCombination: null,
    roundNumber: state.stats[mode].rounds + 1,
    roundId: state.roundId + 1,
    movesPlayed: 0,
    lastMoveIndex: null,
    onlineSymbol: mode === 'online' ? state.onlineSymbol : null,
    onlineVersion: mode === 'online' ? state.onlineVersion : 0,
  }
}

function recordOutcome(state: GameState, result: RoundResult, board: Board): GameState {
  const stats: Stats = {
    pvc: { ...state.stats.pvc },
    pvp: { ...state.stats.pvp },
    online: { ...state.stats.online },
  }

  if (state.mode === 'pvc') {
    stats.pvc.rounds += 1
    if (result === 'draw') {
      stats.pvc.draws += 1
    } else if (result === state.humanSymbol) {
      stats.pvc.playerWins += 1
    } else {
      stats.pvc.computerWins += 1
    }
  } else if (state.mode === 'pvp') {
    stats.pvp.rounds += 1
    if (result === 'draw') {
      stats.pvp.draws += 1
    } else if (result === 'X') {
      stats.pvp.xWins += 1
    } else {
      stats.pvp.oWins += 1
    }
  } else {
    stats.online.rounds += 1
    if (result === 'draw') {
      stats.online.draws += 1
    } else if (result === 'X') {
      stats.online.xWins += 1
    } else {
      stats.online.oWins += 1
    }
  }

  const winnerLabel = result === 'draw' ? 'Draw' : getPlayerLabel(state, result)

  const entry: HistoryEntry = {
    id: `${state.roundId}-${state.roundNumber}-${Date.now()}`,
    round: state.roundNumber,
    mode: state.mode,
    result,
    winnerLabel,
    board: board.slice(),
    timestamp: Date.now(),
  }

  return {
    ...state,
    stats,
    history: [entry, ...state.history].slice(0, 20),
  }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'playMove': {
      // Online moves are applied by the server, never by the client.
      if (state.mode === 'online') return state
      // A move for a stale round is discarded (e.g. an AI reply that was
      // scheduled before the player restarted the round).
      if (action.roundId !== undefined && action.roundId !== state.roundId) return state
      if (state.status !== 'playing') return state
      if (action.player !== state.currentPlayer) return state
      if (!Number.isInteger(action.index)) return state
      if (action.index < 0 || action.index >= state.board.length) return state
      if (state.board[action.index] !== null) return state

      let nextBoard: Board
      try {
        nextBoard = makeMove(state.board, action.index, action.player)
      } catch {
        return state
      }

      const status = getGameStatus(nextBoard)
      const winner = getWinner(nextBoard)
      const winningCombination = getWinningCombination(nextBoard)

      const base: GameState = {
        ...state,
        board: nextBoard,
        currentPlayer: opponentOf(action.player),
        status,
        winner,
        winningCombination,
        movesPlayed: state.movesPlayed + 1,
        lastMoveIndex: action.index,
      }

      if (status === 'won' && winner !== null) {
        return recordOutcome(base, winner, nextBoard)
      }
      if (status === 'draw') {
        return recordOutcome(base, 'draw', nextBoard)
      }
      return base
    }

    case 'applyOnlineState': {
      const { snapshot, mySymbol } = action

      // Out of order or duplicated events must never roll the board back.
      if (snapshot.version < state.onlineVersion) return state

      const next: GameState = {
        ...state,
        mode: 'online',
        board: snapshot.board.slice(),
        currentPlayer: snapshot.currentTurn,
        status: snapshot.status,
        winner: snapshot.winnerSymbol,
        winningCombination: snapshot.winningCombination,
        roundNumber: snapshot.roundNumber,
        movesPlayed: snapshot.movesPlayed,
        lastMoveIndex: snapshot.lastMoveIndex,
        onlineSymbol: mySymbol,
        onlineVersion: snapshot.version,
      }

      // The online round is counted exactly once, when the authoritative
      // result for a round is seen for the first time.
      if (snapshot.result && snapshot.roundNumber > state.onlineCountedRound) {
        const counted: GameState = { ...next, onlineCountedRound: snapshot.roundNumber }
        return recordOutcome(counted, snapshot.result, next.board)
      }

      return next
    }

    case 'newRound':
      return startRound(state)

    case 'newMatch': {
      const stats = createDefaultStats()
      return {
        ...startRound({ ...state, stats }, state.mode),
        stats,
        history: [],
        roundNumber: 1,
      }
    }

    case 'setMode': {
      if (action.mode === state.mode) return state
      // Switching mode always starts a clean round so a half finished board is
      // never carried over.
      return startRound(state, action.mode)
    }

    case 'setDifficulty':
      if (action.difficulty === state.difficulty) return state
      return { ...state, difficulty: action.difficulty }

    case 'setHumanSymbol': {
      if (action.symbol === state.humanSymbol) return state
      // The symbol change would invalidate the current board, so a fresh round
      // is started.
      return { ...startRound(state), humanSymbol: action.symbol }
    }

    case 'setSoundEnabled':
      if (action.enabled === state.soundEnabled) return state
      return { ...state, soundEnabled: action.enabled }

    case 'resetStats':
      return { ...state, stats: createDefaultStats(), history: [] }

    default:
      return state
  }
}
