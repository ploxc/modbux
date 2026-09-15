/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface BitMapZustand {
  /** Address of the currently expanded bitmap row, null if none. */
  expandedAddress: number | null
  toggleExpanded: (address: number) => void
  collapse: () => void
  /**
   * How tall the expanded detail panel renders, measured rather than assumed.
   *
   * The grid's row positions come from `getRowHeight`, so the panel's height
   * has to reach it or the rows below sit under the ones above them and the
   * last of them cannot be scrolled to. No constant can say it: the panel is
   * four rows of bit cards above 560px of container width and eight below.
   */
  detailHeight: number
  setDetailHeight: (height: number) => void
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
      }),

    detailHeight: 0,
    setDetailHeight: (height): void =>
      set((state) => {
        state.detailHeight = height
      })
  }))
)
