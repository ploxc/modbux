import { AddressGroup, ClientState, RegisterData, ScanUnitIDResult, Transaction } from '@shared'

/** What main pushed about one client, and the rows the view drew from it. */
export interface ClientData {
  registerData: RegisterData[]
  addressGroups: AddressGroup[]
  clientState: ClientState
  transactions: Transaction[]
  lastSuccessfulTransactionMillis: number | null
  scanUnitIdResults: ScanUnitIDResult[]
  scanProgress: number
}

/** Every client's data under the uuid the client store holds it under. */
export interface DataZustand {
  clients: Record<string, ClientData>

  // Register data
  setRegisterData: (uuid: string, data: RegisterData[]) => void
  appendRegisterData: (uuid: string, data: RegisterData[]) => void
  setAddressGroups: (uuid: string, groups: AddressGroup[]) => void

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
