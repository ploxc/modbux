/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { AppType, LayoutZustand } from './layout.zustand.types'
import { onEvent } from '@renderer/events'

const isServerWindow = window.api.isServerWindow

export const useLayoutZustand = create<LayoutZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
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
        state.showGridWhileScanning = !state.showGridWhileScanning
      }),
    toggleShowClientRawValues: () =>
      set((state) => {
        state.showClientRawValues = !state.showClientRawValues
      }),

    setHideHomeButton: (hide) =>
      set((state) => {
        state.hideHomeButton = hide
      }),
    toggleShowLog: () =>
      set((state) => {
        state.showLog = !state.showLog
      }),
    appType: isServerWindow ? 'server' : undefined,
    setAppType: (appType: AppType | undefined) =>
      set((state) => {
        state.appType = appType
      })
  }))
)

/**
 * The app version, fetched where the field it fills lives.
 *
 * It was fetched from `client.zustand`'s module tail, the one call that tail
 * made from the window it is otherwise guarded out of. Both windows need the
 * answer: `Home.tsx` prints it, and `SaveButton` and `OpenSaveClear` write it
 * into every config saved, the second of those from the split out server
 * window. `get_app_version` asks `app` rather than the client, so no window is
 * refused it.
 *
 * A rejected invoke leaves `version` at its empty default, which is a
 * `modbuxVersion` of `''` in a saved config and a Home screen with no number.
 * Nothing the user can act on, so this says it happened and nothing more.
 */
window.api
  .getAppVersion()
  .then((version) => useLayoutZustand.getState().setVersion(version))
  .catch((error) => console.error('The app version was not read:', error))

// Listen to main process events
onEvent('window_update', (windows) => {
  if (isServerWindow) return
  const layoutZustand = useLayoutZustand.getState()

  // When we are the main window, set the state accordingly
  layoutZustand.setHideHomeButton(windows.server)
  if (windows.server) layoutZustand.setAppType('client')
})
