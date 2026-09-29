import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface MonitorZustand {
  /** The groups folded to their head, by `groupKey`. For the session only. */
  folded: Record<string, true>
  toggleFolded: (key: string) => void
  foldAll: (keys: string[]) => void
  unfoldAll: () => void
}

export const useMonitorZustand = create<MonitorZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    folded: {},
    toggleFolded: (key): void =>
      set((state) => {
        if (state.folded[key]) delete state.folded[key]
        else state.folded[key] = true
      }),
    foldAll: (keys): void =>
      set((state) => {
        state.folded = Object.fromEntries(keys.map((key) => [key, true as const]))
      }),
    unfoldAll: (): void =>
      set((state) => {
        state.folded = {}
      })
  }))
)
