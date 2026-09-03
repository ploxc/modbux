import { repairPersistedParity } from '../shared'

export const CURRENT_CLIENT_ZUSTAND_VERSION = 3

/** Where the client store keeps its state. */
export const CLIENT_ZUSTAND_STORAGE_KEY = 'client.zustand'

/** What that key was called while the store was still the root store. */
export const FORMER_CLIENT_ZUSTAND_STORAGE_KEY = 'root.zustand'

/**
 * Migrate client Zustand state to the current version.
 * Used by Zustand persist middleware.
 */
export function migrateClientState(
  persistedState: unknown,
  version: number
): Record<string, unknown> {
  const state = persistedState as Record<string, unknown>

  if (version < 2) {
    // v1→v2: (reserved for future migrations)
  }

  // v2→v3: the RTU parity the serial binding refuses
  if (version < 3) {
    repairPersistedParity(state, 'connectionConfig', 'rtu', 'options')
  }

  return state
}

/** Only what this needs of Storage, so it takes localStorage without naming it. */
type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * Carry the persisted client state to the key the store reads now.
 *
 * persist looks up one key and builds an empty store when it finds nothing, so
 * without this the first launch after the rename comes up with no connection
 * config, no register config and no register mapping. A version bump does not
 * reach this: migrate runs on what was read, and nothing was read.
 *
 * The old key stays where it is. Removing it would take the config of anyone who
 * goes back to an earlier build, and one stale key costs a few hundred bytes.
 *
 * The storage is a parameter because shared is imported by main too, where there
 * is no localStorage to reach for.
 */
export function carryFormerClientState(storage: KeyValueStorage): void {
  try {
    if (storage.getItem(CLIENT_ZUSTAND_STORAGE_KEY) !== null) return
    const persisted = storage.getItem(FORMER_CLIENT_ZUSTAND_STORAGE_KEY)
    if (persisted !== null) storage.setItem(CLIENT_ZUSTAND_STORAGE_KEY, persisted)
  } catch {
    // Storage unavailable means there is nothing to carry either.
  }
}
