import { MAIN_CLIENT_UUID } from '../../default'
import { dropUnmappableRegisters, isRecord, objectValues, repairPersistedParity } from '../shared'

/**
 * One number above what the last release wrote. 2.3.0 shipped 2, under the name
 * `CURRENT_ROOT_ZUSTAND_VERSION` and the key `root.zustand`.
 */
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

  // No v1→v2 step: it wrote `readLocalTime` into `registerConfig`, and
  // `79fa174` took that field out of the client, so a v1 store has nothing to
  // carry. `grep -rn readLocalTime src e2e` returns nothing.

  // v2→v3, one step because 2 is what the last release wrote: the one client
  // folded into a record under a uuid, then, per client, the RTU parity the
  // serial binding refuses and mapping entries at an address outside the 16
  // bit map.
  //
  // Any version but this one, rather than the ones below it, which is the
  // reason `migrateServerState` gives for the same shape: persist calls this
  // for a version above the current one too, and a blob from a newer Modbux is
  // where a parity this enum does not name comes from. Without it one such
  // value costs `repairPersisted` the whole field, and `registerMapping` is
  // the one thing in this store built by hand.
  if (version !== CURRENT_CLIENT_ZUSTAND_VERSION) {
    foldClientIntoRecord(state)
    for (const client of objectValues(state.clients)) {
      repairPersistedParity(client, 'connectionConfig', 'rtu', 'options')
      dropUnmappableRegisters(client)
    }
  }

  return state
}

/** The four fields one client held when the store held one client. */
const FORMER_CLIENT_FIELDS = ['name', 'connectionConfig', 'registerConfig', 'registerMapping']

/**
 * Put a store from before clients were keyed by uuid into one client under
 * `MAIN_CLIENT_UUID`, and select it.
 *
 * Keyed off the shape rather than the version, because version 3 was written
 * both ways: before this build and by it. `migrateClientState` calls it for
 * every version but the current one, and the store's `merge` for the current
 * one. A store that already holds `clients` is left as it is.
 */
export function foldClientIntoRecord(state: Record<string, unknown>): void {
  if (isRecord(state.clients)) return
  if (!FORMER_CLIENT_FIELDS.some((field) => field in state)) return

  const client: Record<string, unknown> = {}
  for (const field of FORMER_CLIENT_FIELDS) {
    if (field in state) client[field] = state[field]
    delete state[field]
  }
  state.clients = { [MAIN_CLIENT_UUID]: client }
  state.selectedUuid = MAIN_CLIENT_UUID
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
