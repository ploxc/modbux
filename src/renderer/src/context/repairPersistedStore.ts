import z from 'zod'
import { ConfigReset, keepCorrupt, repairPersisted } from '@shared'

/** What a store lost on the way in, for a store that lost something. */
interface StoreRepair<State> {
  state: State
  reset: ConfigReset
}

interface PersistedAt {
  storageKey: string
  /** What the blob on disk carried, which only `migrate` is offered. */
  persistedVersion: number | undefined
  currentVersion: number
  /**
   * The state to read, where a caller repaired part of it first.
   *
   * `persist` wraps `setState` with its own `setItem`, so a caller that wrote
   * its repair through the store would have overwritten the key before
   * `keepCorrupt` below copied it, and the copy meant for a bug report would
   * hold the repaired blob. Measured: with the write first, the register that
   * failed was in neither the key nor the copy.
   */
  state?: unknown
  /**
   * Fields a caller repaired itself, which are reported and kept.
   *
   * The server store reads each server back on its own before calling here,
   * because `servers` is one field holding every one of them. Those fields
   * parse by the time the walk below reaches them, so without this the warn,
   * the copy and the message would all say nothing was lost.
   */
  alsoReset?: string[]
}

/**
 * Reads a store's persisted state back through its schema, and answers what
 * failed or undefined when the whole blob parsed.
 *
 * The write stays with the caller. `setState` takes the store's own state type
 * and a schema infers the persisted half of it, so a helper that wrote would
 * have to be generic over both to say those agree. The caller already holds
 * both and needs no generic to do it.
 *
 * Both stores call this while the module graph is still evaluating, which is
 * why it reports through `console` and a store field rather than notistack.
 * The standalone `enqueueSnackbar` is assigned inside the SnackbarProvider
 * constructor, and that provider is built by `createRoot().render()` in
 * `main.tsx`, so calling it from here throws out of module scope and nothing
 * below the call runs: no init, no event listeners, and no React render
 * either. `MessageReceiver` reads `configReset` once it is mounted, where a
 * provider exists to tell.
 *
 * The blob is copied rather than cleared, because a register mapping worth
 * hundreds of rows is worth having in a bug report even once it is unreadable.
 */
export const repairPersistedStore = <Shape extends z.ZodRawShape>(
  store: { getState: () => unknown; getInitialState: () => object },
  schema: z.ZodObject<Shape>,
  { storageKey, persistedVersion, currentVersion, state, alsoReset = [] }: PersistedAt
): StoreRepair<z.infer<z.ZodObject<Shape>>> | undefined => {
  const savedByNewerVersion = persistedVersion !== undefined && persistedVersion > currentVersion
  const repair = repairPersisted(
    schema,
    state ?? store.getState(),
    store.getInitialState(),
    savedByNewerVersion
  )

  const fields = [...(repair.reset?.fields ?? []), ...alsoReset]
  if (fields.length === 0 && !savedByNewerVersion) return undefined
  const reset = { fields, savedByNewerVersion }

  console.warn(`${storageKey} repaired`, reset)
  keepCorrupt(localStorage, storageKey)
  return { state: repair.state, reset }
}
