import { z } from 'zod'
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
  { storageKey, persistedVersion, currentVersion }: PersistedAt
): StoreRepair<z.infer<z.ZodObject<Shape>>> | undefined => {
  const repair = repairPersisted(
    schema,
    store.getState(),
    store.getInitialState(),
    persistedVersion !== undefined && persistedVersion > currentVersion
  )
  if (repair.reset === undefined) return undefined

  console.warn(`${storageKey} repaired`, repair.reset)
  keepCorrupt(localStorage, storageKey)
  return { state: repair.state, reset: repair.reset }
}
