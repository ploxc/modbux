import {
  AddressGroup,
  AddressGroupResult,
  ClientState,
  ClientVisibleSections,
  RegisterData,
  RegisterType,
  ScanUnitIDResult,
  Transaction
} from '@shared'

/** The rows of one unit's register type, and the groups they were read in. */
export interface SectionData {
  registerData: RegisterData[]
  addressGroups: AddressGroup[]
  /** How each group went on its last read, at the index of its group. */
  groupResults: AddressGroupResult[]
}

/** What main pushed about one client, and the rows the view drew from it. */
export interface ClientData {
  /** Each unit's register types, keyed by `sectionKey`. */
  sections: Record<string, SectionData>
  clientState: ClientState
  transactions: Transaction[]
  lastSuccessfulTransactionMillis: number | null
  scanUnitIdResults: ScanUnitIDResult[]
  scanProgress: number
  /** The sections on screen: all a poll of this client reads. */
  shownSections: ClientVisibleSections['sections']
  /** Whether Monitor shows this client, which reads every unit whatever is on screen. */
  monitorShown: boolean
  /**
   * The sections a running poll stopped reading when they left the screen, by
   * `sectionKey`. Their rows are the last it read, until a read replaces them
   * or the poll stops.
   */
  staleSections: string[]
}

/** Every client's data under the uuid the client store holds it under. */
export interface LiveZustand {
  clients: Record<string, ClientData>

  // Register data
  setRegisterData: (
    uuid: string,
    unit: string,
    type: RegisterType,
    data: RegisterData[],
    monitor?: boolean
  ) => void
  appendRegisterData: (uuid: string, unit: string, type: RegisterType, data: RegisterData[]) => void
  setAddressGroups: (
    uuid: string,
    unit: string,
    type: RegisterType,
    groups: AddressGroup[],
    results: AddressGroupResult[],
    monitor?: boolean
  ) => void

  // What is on screen
  showSection: (uuid: string, unit: string, type: RegisterType) => void
  hideSection: (uuid: string, unit: string, type: RegisterType) => void
  showMonitor: (uuid: string) => void
  hideMonitor: (uuid: string) => void

  // State
  setClientState: (uuid: string, clientState: ClientState) => void

  // Transaction log
  addTransactions: (uuid: string, transactions: Transaction[]) => void
  clearTransactions: (uuid: string) => void
  setLastSuccessfulTransactionMillis: (uuid: string, value: number | null) => void

  // Unit ID scanning
  addScanUnitIdResults: (uuid: string, scanUnitIdResults: ScanUnitIDResult[]) => void
  clearScanUnitIdResults: (uuid: string) => void

  // Scan progress
  setScanProgress: (uuid: string, scanProgress: number) => void

  /** Forget a client taken away. */
  dropClient: (uuid: string) => void
}
