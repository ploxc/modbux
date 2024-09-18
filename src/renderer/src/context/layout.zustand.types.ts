export interface LayoutZustand {
  showLog: boolean
  toggleShowLog: () => void
  advanced: boolean
  setAdvanced: (advanced: boolean) => void
  show64Bit: boolean
  setShow64Bit: (show:boolean) => void
}
