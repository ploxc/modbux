import { create } from 'zustand'
import { clientStepKey, emptyStack, pushStep } from './undo.zustand.helpers'
import { UndoZustand } from './undo.zustand.types'

/**
 * The undo and redo stacks, one per store.
 *
 * No persist middleware: history does not outlive a launch. The stores record
 * into this one and never read it back, and the modules that replay a step
 * import both, so neither store imports its own replay.
 */
export const useUndoZustand = create<UndoZustand>()((set, get) => ({
  client: emptyStack(),
  quiet: 0,
  recordClient: (step): void => {
    // A write while quiet is not recorded, and it ends the open run, so the
    // next write to that field does not merge into a step from before it.
    if (get().quiet > 0) {
      set({ client: { ...get().client, openKey: undefined } })
      return
    }
    set({ client: pushStep(get().client, step, clientStepKey(step)) })
  },
  setClient: (client): void => set({ client }),
  beginQuiet: (): void => set({ quiet: get().quiet + 1 }),
  endQuiet: (): void => set({ quiet: get().quiet - 1 })
}))
