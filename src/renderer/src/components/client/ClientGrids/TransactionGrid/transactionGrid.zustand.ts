/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface TransactionGridZustand {
  /** The transactions whose request and responses show in full, by id. */
  expanded: Record<string, true>
  toggleExpanded: (id: string) => void
}

export const useTransactionGridZustand = create<
  TransactionGridZustand,
  [['zustand/mutative', never]]
>(
  mutative((set) => ({
    expanded: {},
    toggleExpanded: (id) =>
      set((state) => {
        if (state.expanded[id]) delete state.expanded[id]
        else state.expanded[id] = true
      })
  }))
)
