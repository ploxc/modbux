import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    showLog: false,
    toggleShowLog: () =>
      set((state) => {
        const currentState = getState()
        state.showLog = !currentState.showLog
      }),
    setShowLog: (show: boolean) =>
      set((state) => {
        state.showLog = show
      }),
    registerGridMenuAnchorEl: null,
    setRegisterGridMenuAnchorEl: (anchorEl: HTMLButtonElement | null) =>
      set((state) => {
        ;(state.registerGridMenuAnchorEl as HTMLButtonElement | null) = anchorEl
      }),
    appType: undefined,
    setAppType: (appType: AppType | undefined) =>
      set((state) => {
        state.appType = appType
      })
  }))
)
