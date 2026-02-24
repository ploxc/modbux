/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface BitMapZustand {
  /** Address of the currently expanded bitmap row, null if none. */
  expandedAddress: number | null
  toggleExpanded: (address: number) => void
  collapse: () => void
}

export const useBitMapZustand = create<BitMapZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    expandedAddress: null,

    toggleExpanded: (address): void =>
      set((state) => {
        state.expandedAddress = state.expandedAddress === address ? null : address
      }),

    collapse: (): void =>
      set((state) => {
        state.expandedAddress = null
      })
  }))
)
