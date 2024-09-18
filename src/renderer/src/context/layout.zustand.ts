import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { LayoutZustand } from './layout.zustand.types'

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    showLog: false,
    toggleShowLog: () =>
      set((state) => {
        const currentState = getState()
        state.showLog = !currentState.showLog
      })
  }))
)
