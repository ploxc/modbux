import {
  Protocol,
  RegisterType,
  ModbusBaudRate,
  ClientState,
  Transaction,
  RegisterMapping,
  RegisterMapValue,
  ScanUnitIDResult,
  RegisterMappingSchema,
  ConnectionConfigSchema,
  RegisterConfigSchema
} from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'
import z from 'zod'

interface Valid {
  host: boolean
  com: boolean
  lenght: boolean
}

export const PersistedRootZustandSchema = z.object({
  registerMapping: RegisterMappingSchema,
  connectionConfig: ConnectionConfigSchema,
  registerConfig: RegisterConfigSchema
})
export type PersistedRootZustand = z.infer<typeof PersistedRootZustandSchema>

export type RootZusand = {
  transactions: Transaction[]
  version: string
  clientState: ClientState
  ready: boolean
  valid: Valid
  lastSuccessfulTransactionMillis: number | null
  scanUnitIdResults: ScanUnitIDResult[]
  scanProgress: number
  // Register mapping
  setRegisterMapping: <K extends keyof RegisterMapValue, V extends RegisterMapValue[K]>(
    register: number,
    key: K,
    value: V
  ) => void
  replaceRegisterMapping: (registerMapping: RegisterMapping) => void
  clearRegisterMapping: () => void
  // Transaction log
  addTransaction: (transactions: Transaction) => void
  clearTransactions: () => void
  // Config
  init: () => Promise<void>
  // State
  setClientState: (clientState: ClientState) => void
  // Configuration actions
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
  setLastSuccessfulTransactionMillis: (value: number | null) => void

  // Unit ID Scannning
  addScanUnitIdResult: (scanUnitIdResult: ScanUnitIDResult) => void
  clearScanUnitIdResults: () => void

  // Scan progress
  setScanProgress: (scanProgress: number) => void

  // Read configuration
  setReadConfiguration: (readConfiguration: boolean) => void
  // Version
  setVersion: (version: string) => void
} & PersistedRootZustand

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void
