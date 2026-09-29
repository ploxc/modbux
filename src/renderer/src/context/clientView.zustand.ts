import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutative } from 'zustand-mutative'
import z from 'zod'
import { ClientViewMode, ClientViewZustand } from './clientView.zustand.types'

const PersistedClientViewSchema = z.object({ view: z.enum(['debug', 'monitor']) })

/**
 * Which of the two client views the window shows, kept across launches.
 *
 * A store of its own rather than a field of `layout.zustand`, because persist
 * writes the whole partialized state on every `setState`: the split out server
 * window evaluates the layout store too and writes to it, and would write its
 * stale view over the one the main window chose.
 */
export const useClientViewZustand = create<
  ClientViewZustand,
  [['zustand/persist', { view: ClientViewMode }], ['zustand/mutative', never]]
>(
  persist(
    mutative((set) => ({
      view: 'debug',
      setView: (view): void => {
        set((state) => {
          state.view = view
        })
      }
    })),
    {
      name: 'clientView.zustand',
      version: 1,
      // A stored view that does not parse leaves Debug.
      merge: (persisted, current): ClientViewZustand => {
        const parsed = PersistedClientViewSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
      partialize: (state): { view: ClientViewMode } => ({ view: state.view })
    }
  )
)
