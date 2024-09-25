import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'
import { IpcEvent, WindowsOpen } from '@shared'

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    showLog: false,
    isServerWindow: window.api.isServerWindow,
    hideHomeButton: window.api.isServerWindow,
    setHideHomeButton: (hide) =>
      set((state) => {
        state.hideHomeButton = hide
      }),
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
    appType: window.api.isServerWindow ? AppType.Server : undefined,
    setAppType: (appType: AppType | undefined) =>
      set((state) => {
        state.appType = appType
      })
  }))
)

// Listen to main process events
window.electron.ipcRenderer.on(IpcEvent.WindowUpdate, (_, windows: WindowsOpen) => {
  const state = useLayoutZustand.getState()
  if (state.isServerWindow) return

  // When we are the main window, set the state accordingly
  state.setHideHomeButton(windows.server)
  if (windows.server) state.setAppType(AppType.Client)
})
