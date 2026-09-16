/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { BitMapZustand } from './bitmap.zustand.types'

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
