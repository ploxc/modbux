import {
  RegisterData,
  ConnectionConfig,
  RegisterConfig,
  Protocol,
  RegisterType,
  ModbusBaudRate,
  ClientState,
  Transaction,
  RegisterMapping,
  RegisterMapValue,
  ScanUnitIDResult
} from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'

export interface RootZusand {
  // Register data
  registerData: RegisterData[]
  setRegisterData: (data: RegisterData[]) => void
  appendRegisterData: (data: RegisterData[]) => void

  // Register mapping
  registerMapping: RegisterMapping
  setRegisterMapping: <K extends keyof RegisterMapValue, V extends RegisterMapValue[K]>(
    register: number,
    key: K,
    value: V
  ) => void
  replaceRegisterMapping: (registerMapping: RegisterMapping) => void
  clearRegisterMapping: () => void
  // Transaction log
  transactions: Transaction[]
  addTransaction: (transactions: Transaction) => void
  clearTransactions: () => void

  // Config
  init: () => Promise<void>
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig

  // State
  clientState: ClientState
  setClientState: (clientState: ClientState) => void
  ready: boolean

  // Configuration actions
  valid: Valid
  setProtocol: (protocol: Protocol) => void
  setPort: MaskSetFn
  setHost: MaskSetFn
  setUnitId: MaskSetFn
  setAddress: MaskSetFn
  setLength: MaskSetFn
  setType: (type: RegisterType) => void
  setCom: MaskSetFn
  setBaudRate: (baudRate: ModbusBaudRate) => void
  setParity: (parity: SerialPortOptions['parity']) => void
  setDataBits: (dataBits: SerialPortOptions['dataBits']) => void
  setStopBits: (stopBits: SerialPortOptions['stopBits']) => void
  setPollRate: (pollRate: number) => void
  setTimeout: (timeout: number) => void
  setLittleEndian: (littleEndian: boolean) => void

  // Layout configuration settings (i want them to be persistent)
  setAddressBase: (addressBase: '0' | '1') => void
  setAdvancedMode: (advancedMode: boolean) => void
  setShow64BitValues: (show64BitValues: boolean) => void

  // Transaction
  lastSuccessfulTransactionMillis: number | null
  setLastSuccessfulTransactionMillis: (value: number | null) => void

  // Unit ID Scannning
  scanUnitIdResults: ScanUnitIDResult[]
  addScanUnitIdResult: (scanUnitIdResult: ScanUnitIDResult) => void
  clearScanUnitIdResults: () => void

  // Scan progress
  scanProgress: number
  setScanProgress: (scanProgress: number) => void
}

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void

interface Valid {
  host: boolean
  com: boolean
  lenght: boolean
}
