import { useCallback, useRef, useState } from 'react'

export interface UsePersistentStateOptions<T> {
  /** Reads the persisted value. Return `null` when nothing valid is stored. */
  load: () => T | null
  /** Writes the value. Implementations must never throw. */
  save: (value: T) => void
  /** Value used when nothing valid is stored. */
  initialValue: T
  /** Optional custom serialiser used for de-duplication. */
  serialize?: (value: T) => string
  /** Optional probe telling whether the underlying storage is usable. */
  isAvailable?: () => boolean
}

export interface UsePersistentStateResult<T> {
  /** The value that was restored on mount. */
  value: T
  /** Persists a new value. Writes are de-duplicated by serialised content. */
  persist: (value: T) => void
  /** `false` when the underlying storage is unavailable (private mode, quota...). */
  available: boolean
}

/**
 * Small wrapper around `localStorage` persistence.
 *
 * - Reads the stored value synchronously on mount (so the very first render
 *   already shows the restored state).
 * - De-duplicates writes so we never touch storage on every render.
 * - Never throws when storage is blocked or contains invalid JSON.
 */
export function usePersistentState<T>({
  load,
  save,
  initialValue,
  serialize,
  isAvailable,
}: UsePersistentStateOptions<T>): UsePersistentStateResult<T> {
  const [value] = useState<T>(() => {
    try {
      return load() ?? initialValue
    } catch {
      return initialValue
    }
  })

  const lastWritten = useRef<string | null>(null)

  // Probed exactly once, on mount: the probe writes to localStorage and must
  // never run on every render.
  const [available] = useState(() => {
    if (!isAvailable) return true
    try {
      return isAvailable()
    } catch {
      return false
    }
  })

  const persist = useCallback(
    (next: T) => {
      let signature: string
      try {
        signature = serialize ? serialize(next) : JSON.stringify(next)
      } catch {
        signature = String(Date.now())
      }
      if (lastWritten.current === signature) return
      lastWritten.current = signature
      try {
        save(next)
      } catch {
        // Storage failures are non fatal.
      }
    },
    [save, serialize],
  )

  return { value, persist, available }
}