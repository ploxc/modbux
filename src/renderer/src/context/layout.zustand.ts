/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import {
  AppType,
  LayoutZustand,
  PersistedLayoutZustand,
  PersistedLayoutZustandSchema
} from './layout.zustand.types'
import { persist } from 'zustand/middleware'
import { onEvent, sendEvent } from '@renderer/events'

const isServerWindow = window.api.isServerWindow

export const useLayoutZustand = create<
  LayoutZustand,
  [['zustand/persist', PersistedLayoutZustand], ['zustand/mutative', never]]
>(
  persist(
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
    })),
    {
      name: `layout.zustand${isServerWindow ? '.server' : ''}`,
      partialize: (state) => ({
        showLog: state.showLog,
        appType: state.appType
      })
    }
  )
)

// Clear when state is corrupted
const clear = (): void => {
  console.log('Clearing storage...')
  useLayoutZustand.persist.clearStorage()
  useLayoutZustand.setState(useLayoutZustand.getInitialState())
}

const state = useLayoutZustand.getState()

const stateResult = PersistedLayoutZustandSchema.safeParse(state)
if (!stateResult.success) {
  console.log(stateResult.error)
  clear()
}

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
