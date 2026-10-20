import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  STORAGE_KEY,
  STORAGE_VERSION,
  clearPersistedState,
  createDefaultPersistedState,
  loadPersistedState,
  savePersistedState,
  validatePersistedState,
} from './storage'

describe('validatePersistedState', () => {
  it('keeps a valid payload untouched', () => {
    const payload = {
      version: STORAGE_VERSION,
      mode: 'pvp' as const,
      difficulty: 'hard' as const,
      humanSymbol: 'O' as const,
      soundEnabled: true,
      stats: {
        pvc: { rounds: 3, playerWins: 2, computerWins: 1, draws: 0 },
        pvp: { rounds: 1, xWins: 1, oWins: 0, draws: 0 },
        online: { rounds: 2, xWins: 1, oWins: 1, draws: 0 },
      },
      history: [],
    }
    expect(validatePersistedState(payload)).toEqual(payload)
  })

  it('migrates a version 1 payload and keeps the local statistics', () => {
    const migrated = validatePersistedState({
      version: 1,
      mode: 'pvp',
      difficulty: 'easy',
      humanSymbol: 'O',
      soundEnabled: true,
      stats: {
        pvc: { rounds: 3, playerWins: 2, computerWins: 1, draws: 0 },
        pvp: { rounds: 1, xWins: 1, oWins: 0, draws: 0 },
      },
      history: [],
    })

    expect(migrated.version).toBe(STORAGE_VERSION)
    expect(migrated.mode).toBe('pvp')
    expect(migrated.difficulty).toBe('easy')
    expect(migrated.stats.pvc.playerWins).toBe(2)
    expect(migrated.stats.pvp.xWins).toBe(1)
    expect(migrated.stats.online).toEqual({ rounds: 0, xWins: 0, oWins: 0, draws: 0 })
  })

  it('falls back to defaults for a completely invalid payload', () => {
    expect(validatePersistedState(null)).toEqual(createDefaultPersistedState())
    expect(validatePersistedState('nope')).toEqual(createDefaultPersistedState())
    expect(validatePersistedState([])).toEqual(createDefaultPersistedState())
  })

  it('discards an incompatible schema version', () => {
    const payload = { ...createDefaultPersistedState(), version: 99, mode: 'pvp' }
    expect(validatePersistedState(payload).mode).toBe('pvc')
  })

  it('accepts the online mode', () => {
    const payload = { ...createDefaultPersistedState(), mode: 'online' }
    expect(validatePersistedState(payload).mode).toBe('online')
  })

  it('repairs individual invalid fields', () => {
    const repaired = validatePersistedState({
      version: STORAGE_VERSION,
      mode: 'not-a-mode',
      difficulty: 'impossible',
      humanSymbol: 'Z',
      soundEnabled: 'yes',
      stats: { pvc: { rounds: -5, playerWins: 'many' }, pvp: 'broken' },
      history: [{ mode: 'pvc', result: 'draw', board: [1, 2, 3] }],
    })

    const defaults = createDefaultPersistedState()
    expect(repaired.mode).toBe(defaults.mode)
    expect(repaired.difficulty).toBe(defaults.difficulty)
    expect(repaired.humanSymbol).toBe(defaults.humanSymbol)
    expect(repaired.soundEnabled).toBe(defaults.soundEnabled)
    expect(repaired.stats.pvc.rounds).toBe(0)
    expect(repaired.stats.pvc.playerWins).toBe(0)
    expect(repaired.stats.pvp.rounds).toBe(0)
    expect(repaired.history).toHaveLength(0)
  })

  it('drops history entries with an invalid shape', () => {
    const repaired = validatePersistedState({
      version: STORAGE_VERSION,
      history: [
        { id: 'a', round: 1, mode: 'pvc', result: 'X', winnerLabel: 'You', board: new Array(9).fill(null), timestamp: 1 },
        { id: 'b', round: 2, mode: 'pvc', result: 'nope', winnerLabel: 'You', board: new Array(9).fill(null), timestamp: 2 },
        { id: 'c', round: 3, mode: 'nope', result: 'X', winnerLabel: 'You', board: new Array(9).fill(null), timestamp: 3 },
        { id: 'd', round: 4, mode: 'pvc', result: 'X', winnerLabel: 'You', board: [1, 2], timestamp: 4 },
        'garbage',
      ],
    })
    expect(repaired.history).toHaveLength(1)
    expect(repaired.history[0].id).toBe('a')
  })
})

describe('localStorage integration', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('returns null when nothing is stored', () => {
    expect(loadPersistedState()).toBeNull()
  })

  it('saves and loads a state', () => {
    const state = createDefaultPersistedState()
    state.difficulty = 'hard'
    state.stats.pvc.playerWins = 4

    expect(savePersistedState(state)).toBe(true)
    const loaded = loadPersistedState()
    expect(loaded?.difficulty).toBe('hard')
    expect(loaded?.stats.pvc.playerWins).toBe(4)
  })

  it('returns null for corrupted JSON instead of throwing', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json')
    expect(() => loadPersistedState()).not.toThrow()
    expect(loadPersistedState()).toBeNull()
  })

  it('survives a blocked localStorage', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })

    expect(loadPersistedState()).toBeNull()
    expect(savePersistedState(createDefaultPersistedState())).toBe(false)
    expect(() => clearPersistedState()).not.toThrow()

    getItem.mockRestore()
    setItem.mockRestore()
    removeItem.mockRestore()
  })
})
