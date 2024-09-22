export interface LayoutZustand {
  showLog: boolean
  toggleShowLog: () => void
  setShowLog: (show: boolean) => void
  registerGridMenuAnchorEl: HTMLButtonElement | null
  setRegisterGridMenuAnchorEl: (el: HTMLButtonElement | null) => void
}
