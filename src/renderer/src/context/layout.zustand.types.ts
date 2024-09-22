export enum AppType {
  Client = 'Client',
  Server = 'Server'
}

export interface LayoutZustand {
  showLog: boolean
  toggleShowLog: () => void
  setShowLog: (show: boolean) => void
  registerGridMenuAnchorEl: HTMLButtonElement | null
  setRegisterGridMenuAnchorEl: (el: HTMLButtonElement | null) => void
  appType: AppType | undefined
  setAppType: (appType: AppType | undefined) => void
}
