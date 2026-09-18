/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'
import { onEvent } from '@renderer/events'

const isServerWindow = window.api.isServerWindow

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set, get) => ({
    showLog: false,
    version: '',
    setVersion: (version) =>
      set((state) => {
        state.version = version
      }),
    hideHomeButton: isServerWindow,
    showClientRawValues: false,
    showGridWhileScanning: true,
    toggleShowGridWhileScanning: () =>
      set((state) => {
        state.showGridWhileScanning = !get().showGridWhileScanning
      }),
    toggleShowClientRawValues: () =>
      set((state) => {
        state.showClientRawValues = !get().showClientRawValues
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
    appType: isServerWindow ? 'server' : undefined,
    setAppType: (appType: AppType | undefined) =>
      set((state) => {
        state.appType = appType
      })
  }))
)

// Listen to main process events
onEvent('window_update', (windows) => {
  if (isServerWindow) return
  const layoutZustand = useLayoutZustand.getState()

  // When we are the main window, set the state accordingly
  layoutZustand.setHideHomeButton(windows.server)
  if (windows.server) layoutZustand.setAppType('client')
})
