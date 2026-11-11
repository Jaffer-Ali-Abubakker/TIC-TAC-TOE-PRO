import type {
  BoardSize,
  Cell,
  Difficulty,
  GameMode,
  HistoryEntry,
  Player,
  Stats,
} from '../game/types'
import {
  MAX_CELLS,
  THREE_BY_THREE,
  normaliseBoardSize,
} from '../game/gameLogic'

export const STORAGE_KEY = 'tic-tac-toe-pro:state'
export const STORAGE_VERSION = 3
export const MAX_HISTORY_ENTRIES = 20

/** Shape of the data that is written to `localStorage`. */
export interface PersistedState {
  version: number
  mode: GameMode
  difficulty: Difficulty
  humanSymbol: Player
  soundEnabled: boolean
  boardSize: BoardSize
  stats: Stats
  history: HistoryEntry[]
}

export function createDefaultStats(): Stats {
  return {
    pvc: { rounds: 0, playerWins: 0, computerWins: 0, draws: 0 },
    pvp: { rounds: 0, xWins: 0, oWins: 0, draws: 0 },
    online: { rounds: 0, xWins: 0, oWins: 0, draws: 0 },
  }
}

export function createDefaultPersistedState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    mode: 'pvc',
    difficulty: 'medium',
    humanSymbol: 'X',
    soundEnabled: false,
    boardSize: THREE_BY_THREE,
    stats: createDefaultStats(),
    history: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

function isPlayer(value: unknown): value is Player {
  return value === 'X' || value === 'O'
}

function isGameMode(value: unknown): value is GameMode {
  return value === 'pvc' || value === 'pvp' || value === 'online'
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

function isCell(value: unknown): value is Cell {
  return value === null || isPlayer(value)
}

function parseStats(value: unknown): Stats {
  const fallback = createDefaultStats()
  if (!isRecord(value)) return fallback

  const pvc = isRecord(value.pvc) ? value.pvc : {}
  const pvp = isRecord(value.pvp) ? value.pvp : {}
  const online = isRecord(value.online) ? value.online : {}

  return {
    pvc: {
      rounds: isNonNegativeInteger(pvc.rounds) ? pvc.rounds : fallback.pvc.rounds,
      playerWins: isNonNegativeInteger(pvc.playerWins) ? pvc.playerWins : fallback.pvc.playerWins,
      computerWins: isNonNegativeInteger(pvc.computerWins)
        ? pvc.computerWins
        : fallback.pvc.computerWins,
      draws: isNonNegativeInteger(pvc.draws) ? pvc.draws : fallback.pvc.draws,
    },
    pvp: {
      rounds: isNonNegativeInteger(pvp.rounds) ? pvp.rounds : fallback.pvp.rounds,
      xWins: isNonNegativeInteger(pvp.xWins) ? pvp.xWins : fallback.pvp.xWins,
      oWins: isNonNegativeInteger(pvp.oWins) ? pvp.oWins : fallback.pvp.oWins,
      draws: isNonNegativeInteger(pvp.draws) ? pvp.draws : fallback.pvp.draws,
    },
    online: {
      rounds: isNonNegativeInteger(online.rounds) ? online.rounds : fallback.online.rounds,
      xWins: isNonNegativeInteger(online.xWins) ? online.xWins : fallback.online.xWins,
      oWins: isNonNegativeInteger(online.oWins) ? online.oWins : fallback.online.oWins,
      draws: isNonNegativeInteger(online.draws) ? online.draws : fallback.online.draws,
    },
  }
}

function parseBoardSize(value: unknown): BoardSize {
  if (!isRecord(value)) return THREE_BY_THREE
  return normaliseBoardSize(toInteger(value.rows), toInteger(value.cols)) ?? THREE_BY_THREE
}

function toInteger(value: unknown): number {
  return isFiniteNumber(value) ? Math.trunc(value) : Number.NaN
}

function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return []
  const entries: HistoryEntry[] = []

  for (const raw of value) {
    if (!isRecord(raw)) continue
    if (!isGameMode(raw.mode)) continue
    if (raw.result !== 'X' && raw.result !== 'O' && raw.result !== 'draw') continue
    // The smallest board is 3x3, the largest is capped at 100 cells.
    if (!Array.isArray(raw.board) || raw.board.length < 9 || raw.board.length > MAX_CELLS) continue
    if (!raw.board.every(isCell)) continue

    // v3 entries carry their shape; v2 entries were always 3x3.
    const size =
      isFiniteNumber(raw.rows) && isFiniteNumber(raw.cols)
        ? normaliseBoardSize(toInteger(raw.rows), toInteger(raw.cols))
        : null
    const rows = size?.rows ?? Math.round(Math.sqrt(raw.board.length))
    const cols = size?.cols ?? rows
    if (rows * cols !== raw.board.length) continue

    entries.push({
      id: typeof raw.id === 'string' ? raw.id : `entry-${entries.length}`,
      round: isNonNegativeInteger(raw.round) ? raw.round : 0,
      mode: raw.mode,
      result: raw.result,
      winnerLabel: typeof raw.winnerLabel === 'string' ? raw.winnerLabel : 'Unknown',
      board: raw.board.slice() as Cell[],
      rows,
      cols,
      timestamp: isFiniteNumber(raw.timestamp) ? raw.timestamp : 0,
    })

    if (entries.length >= MAX_HISTORY_ENTRIES) break
  }

  return entries
}

/**
 * Migrates a version 1 or 2 payload to the current version.
 *
 * v1 only knew the `pvc` and `pvp` score books. v2 added the online book and
 * the online mode. v3 added the board size, which defaults to the classic 3x3.
 */
export function migratePersistedState(value: Record<string, unknown>): PersistedState {
  const fallback = createDefaultPersistedState()
  const stats = parseStats(value.stats)

  return {
    version: STORAGE_VERSION,
    mode: isGameMode(value.mode) ? value.mode : fallback.mode,
    difficulty: isDifficulty(value.difficulty) ? value.difficulty : fallback.difficulty,
    humanSymbol: isPlayer(value.humanSymbol) ? value.humanSymbol : fallback.humanSymbol,
    soundEnabled:
      typeof value.soundEnabled === 'boolean' ? value.soundEnabled : fallback.soundEnabled,
    boardSize: parseBoardSize(value.boardSize),
    stats: {
      pvc: stats.pvc,
      pvp: stats.pvp,
      online: stats.online,
    },
    history: parseHistory(value.history),
  }
}

/**
 * Validates and normalises an arbitrary value into a valid {@link PersistedState}.
 * Unknown or corrupted fields fall back to safe defaults instead of throwing.
 */
export function validatePersistedState(value: unknown): PersistedState {
  const fallback = createDefaultPersistedState()
  if (!isRecord(value)) return fallback

  // Older payloads are migrated instead of being thrown away.
  if (value.version === 1 || value.version === 2) {
    return migratePersistedState(value)
  }

  // A future/incompatible version is discarded rather than partially trusted.
  if (value.version !== STORAGE_VERSION) return fallback

  return migratePersistedState(value)
}

/** True when `localStorage` can be read and written in this environment. */
export function isStorageAvailable(): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    const probe = `${STORAGE_KEY}:probe`
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return true
  } catch {
    return false
  }
}

/** Reads and validates the persisted state. Returns `null` when unavailable or invalid. */
export function loadPersistedState(): PersistedState | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    return validatePersistedState(parsed)
  } catch {
    // Corrupted JSON, blocked storage or a privacy mode - all non fatal.
    return null
  }
}

/** Writes the persisted state. Returns `false` when the write could not be performed. */
export function savePersistedState(state: PersistedState): boolean {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

/** Removes the persisted state. Never throws. */
export function clearPersistedState(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
