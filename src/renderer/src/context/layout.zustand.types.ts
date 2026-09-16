export type AppType = 'client' | 'server'

export interface LayoutZustand {
  /** The running app's own version, read once at startup. Not the client's. */
  version: string
  setVersion: (version: string) => void
  hideHomeButton: boolean
  showClientRawValues: boolean
  /** Whether the register grid keeps filling while a scan runs. */
  showGridWhileScanning: boolean
  showLog: boolean
  appType: AppType | undefined
  toggleShowClientRawValues: () => void
  setHideHomeButton: (hide: boolean) => void
  toggleShowLog: () => void
  toggleShowGridWhileScanning: () => void
  setShowLog: (show: boolean) => void
  setAppType: (appType: AppType | undefined) => void
}
