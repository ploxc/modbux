import {
  RegisterData,
  ConnectionConfig,
  RegisterConfig,
  Protocol,
  RegisterType,
  ModbusBaudRate,
  ClientState,
  ConnectState,
  Transaction
} from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'

export interface RootZusand {
  // Register data
  registerData: RegisterData[]
  setRegisterData: (data: RegisterData[]) => void
  
  // Transaction log
  transactions: Transaction[]
  addTransaction: (transactions: Transaction) => void

  // Config
  init: () => Promise<void>
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig

  // State
  clientState: ClientState
  setConnectState: (connectState: ConnectState) => void
  setPolling: (polling: boolean) => void
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
  setSwap: (swap: boolean) => void

  // Address set actions
  addressBase: '0' | '1'
  setAddressBase: (value: '0' | '1') => void

  // Transaction
  lastSuccessfulTransactionMillis: number | null
  setLastSuccessfulTransactionMillis: (value: number | null) => void
}

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void

interface Valid {
  host: boolean
  com: boolean
  lenght: boolean
}
