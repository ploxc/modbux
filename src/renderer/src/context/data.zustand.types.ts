import { AddressGroup, ClientState, RegisterData, ScanUnitIDResult, Transaction } from '@shared'

export interface DataZustand {
  // Register data
  registerData: RegisterData[]
  setRegisterData: (data: RegisterData[]) => void
  appendRegisterData: (data: RegisterData[]) => void
  addressGroups: AddressGroup[]
  setAddressGroups: (groups: AddressGroup[]) => void

  // State
  clientState: ClientState
  setClientState: (clientState: ClientState) => void

  // Transaction log
  transactions: Transaction[]
  addTransaction: (transaction: Transaction) => void
  clearTransactions: () => void
  lastSuccessfulTransactionMillis: number | null
  setLastSuccessfulTransactionMillis: (value: number | null) => void

  // Unit ID scanning
  scanUnitIdResults: ScanUnitIDResult[]
  addScanUnitIdResults: (scanUnitIdResults: ScanUnitIDResult[]) => void
  clearScanUnitIdResults: () => void

  // Scan progress
  scanProgress: number
  setScanProgress: (scanProgress: number) => void
}
