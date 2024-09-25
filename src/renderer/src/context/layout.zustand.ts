import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'
import { IpcEvent, WindowsOpen } from '@shared'
import { persist } from 'zustand/middleware'

const isServerWindow = window.api.isServerWindow

export const useLayoutZustand = create<
  LayoutZustand,
  [['zustand/persist', never], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, getState) => ({
      showLog: false,
      homeShiftKeyDown: false,
      setHomeShiftKeyDown: (down) =>
        set((state) => {
          state.homeShiftKeyDown = down
        }),
      hideHomeButton: isServerWindow,
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
      appType: isServerWindow ? AppType.Server : undefined,
      setAppType: (appType: AppType | undefined) =>
        set((state) => {
          state.appType = appType
        })
    })),
    { name: `layout.zustand${isServerWindow ? '.server' : ''}` }
  )
)

const state = useLayoutZustand.getState()

// When opening the window and the windows were split, open the windows again
// Will only happen with macos
if (state.hideHomeButton && !isServerWindow) {
  window.electron.ipcRenderer.send(IpcEvent.OpenServerWindow)
}

// Listen to main process events
window.electron.ipcRenderer.on(IpcEvent.WindowUpdate, (_, windows: WindowsOpen) => {
  if (isServerWindow) return
  const state = useLayoutZustand.getState()

  // When we are the main window, set the state accordingly
  state.setHideHomeButton(windows.server)
  if (windows.server) state.setAppType(AppType.Client)
})
