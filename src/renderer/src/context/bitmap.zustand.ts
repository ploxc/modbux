/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { BitMapConfig } from '@shared'

// ─── Note ────────────────────────────────────────────────────────────────────
// After the types merge (adding `bitMap` to RegisterMapValue), the
// `bitComments` map below can be removed and comments should be read/written
// via:
//   useRootZustand.getState().setRegisterMapping(address, 'bitMap', config)
//   useRootZustand.getState().registerMapping[type][address]?.bitMap
// ─────────────────────────────────────────────────────────────────────────────

interface BitMapZustand {
  /** Address of the currently expanded bitmap row, null if none. */
  expandedAddress: number | null
  toggleExpanded: (address: number) => void
  collapse: () => void

  /**
   * Temporary comment store, keyed by register address.
   * Replaced by registerMapping[type][address].bitMap after the types merge.
   */
  bitComments: Record<number, BitMapConfig>
  setBitComment: (address: number, bitIndex: number, comment: string | undefined) => void
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

    bitComments: {},

    setBitComment: (address, bitIndex, comment): void =>
      set((state) => {
        if (!state.bitComments[address]) state.bitComments[address] = {}
        if (comment === undefined) {
          delete state.bitComments[address][String(bitIndex)]
        } else {
          state.bitComments[address][String(bitIndex)] = { comment }
        }
      })
  }))
)
