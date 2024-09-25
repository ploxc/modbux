export enum AppType {
  Client = 'Client',
  Server = 'Server'
}

export interface LayoutZustand {
  hideHomeButton: boolean
  homeShiftKeyDown: boolean
  setHomeShiftKeyDown: (down: boolean) => void
  setHideHomeButton: (hide: boolean) => void
  showLog: boolean
  toggleShowLog: () => void
  setShowLog: (show: boolean) => void
  registerGridMenuAnchorEl: HTMLButtonElement | null
  setRegisterGridMenuAnchorEl: (el: HTMLButtonElement | null) => void
  appType: AppType | undefined
  setAppType: (appType: AppType | undefined) => void
}
