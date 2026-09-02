/** Where the client store has kept its state since it stopped being the root. */
export const CLIENT_ZUSTAND_STORAGE_KEY = 'client.zustand'

/** What it was called before that. */
const FORMER_STORAGE_KEY = 'root.zustand'

/**
 * Carry the persisted state to the key the store reads now.
 *
 * persist looks up one key and builds an empty store when it finds nothing, so
 * without this the first launch after the rename comes up with no connection
 * config, no register config and no register mapping. There is no version bump
 * that fixes this: migrate runs on what was read, and nothing was read.
 *
 * The old key is left in place. Removing it would take the config of anyone who
 * goes back to an earlier build, and one stale key costs a few hundred bytes.
 *
 * Called once in client.zustand.ts, before the store is built.
 */
export const carryFormerStorageKey = (): void => {
  try {
    if (localStorage.getItem(CLIENT_ZUSTAND_STORAGE_KEY) !== null) return
    const persisted = localStorage.getItem(FORMER_STORAGE_KEY)
    if (persisted !== null) localStorage.setItem(CLIENT_ZUSTAND_STORAGE_KEY, persisted)
  } catch {
    // Storage unavailable means there is nothing to carry either.
  }
}
