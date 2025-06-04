/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'
import { onEvent, sendEvent } from '@renderer/events'

const isServerWindow = window.api.isServerWindow

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set, get) => ({
    showLog: false,
    homeShiftKeyDown: false,
    hideHomeButton: isServerWindow,
    showClientRawValues: false,
    toggleShowClientRawValues: () =>
      set((state) => {
        state.showClientRawValues = !get().showClientRawValues
      }),

    setHomeShiftKeyDown: (down) =>
      set((state) => {
        state.homeShiftKeyDown = down
      }),

    setHideHomeButton: (hide) =>
      set((state) => {
        state.hideHomeButton = hide
      }),
    toggleShowLog: () =>
      set((state) => {
        const currentState = get()
        state.showLog = !currentState.showLog
      }),
    setShowLog: (show: boolean) =>
      set((state) => {
        state.showLog = show
      }),
    appType: isServerWindow ? 'server' : undefined,
    setAppType: (appType: AppType | undefined) =>
      set((state) => {
        state.appType = appType
      })
  }))
)

const state = useLayoutZustand.getState()

// When opening the window and the windows were split, open the windows again
// Will only happen with macos
if (state.hideHomeButton && !isServerWindow) {
  sendEvent('open_server_window')
}

// Listen to main process events
onEvent('window_update', (windows) => {
  if (isServerWindow) return
  const state = useLayoutZustand.getState()

  // When we are the main window, set the state accordingly
  state.setHideHomeButton(windows.server)
  if (windows.server) state.setAppType('client')
})
