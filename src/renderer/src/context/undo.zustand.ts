import { create } from 'zustand'
import {
  clientStepKey,
  emptyStack,
  moveStep,
  pushStep,
  serverStepKey
} from './undo.zustand.helpers'
import { UndoOutcome, UndoRefusal, UndoStack, UndoZustand } from './undo.zustand.types'

/**
 * The undo and redo stacks, one per store.
 *
 * No persist middleware: history does not outlive a launch. The stores record
 * into this one and never read it back, and the modules that replay a step
 * import both, so neither store imports its own replay.
 */
export const useUndoZustand = create<UndoZustand>()((set, get) => ({
  client: emptyStack(),
  server: emptyStack(),
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
  recordServer: (step): void => {
    if (get().quiet > 0) {
      set({ server: { ...get().server, openKey: undefined } })
      return
    }
    set({ server: pushStep(get().server, step, serverStepKey(step)) })
  },
  setServer: (server): void => set({ server }),
  beginQuiet: (): void => set({ quiet: get().quiet + 1 }),
  endQuiet: (): void => set({ quiet: get().quiet - 1 })
}))

/**
 * Replays the newest step of one stack in one direction, and moves it across
 * when the replay took.
 *
 * Quiet while it runs, so the setters the replay calls record nothing, and
 * `busy` while another replay or an action recorded as one step is running.
 */
export const replayTop = async <Step extends object>(
  stack: { read: () => UndoStack<Step>; write: (stack: UndoStack<Step>) => void },
  direction: 'undo' | 'redo',
  replay: (step: Step) => Promise<Step | UndoRefusal | undefined>
): Promise<UndoOutcome> => {
  const undo = useUndoZustand.getState()
  if (undo.quiet > 0) return 'busy'

  const current = stack.read()
  const step = (direction === 'undo' ? current.past : current.future).at(-1)
  if (step === undefined) return 'empty'

  undo.beginQuiet()
  let replaced: Step | UndoRefusal | undefined
  try {
    replaced = await replay(step)
  } finally {
    undo.endQuiet()
  }
  if (replaced === undefined) return 'refused'
  if (typeof replaced === 'string') return replaced

  stack.write(moveStep(stack.read(), direction, step, replaced))
  return 'done'
}
