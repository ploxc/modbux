import { TcpPortOptions, SerialPortOptions } from 'modbus-serial/ModbusRTU'
import { SharedProps } from 'notistack'

//
//
// Api
export interface Api {
  isServerWindow: boolean
  getConnectionConfig: () => Promise<ConnectionConfig>
  updateConnectionConfig: (config: DeepPartial<ConnectionConfig>) => void
  getRegisterConfig: () => Promise<RegisterConfig>
  updateRegisterConfig: (config: DeepPartial<RegisterConfig>) => void
  getClientState: () => Promise<ClientState>
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  read: () => Promise<RegisterData[] | undefined>
  startPolling: () => Promise<void>
  stopPolling: () => Promise<void>
  write: (writeParameters: WriteParameters) => Promise<void>
  scanUnitIds: (scanUnitIdParams: ScanUnitIDParameters) => Promise<void>
  stopScanningUnitIds: () => Promise<void>
  scanRegisters: (scanRegistersParams: ScanRegistersParameters) => Promise<void>
  stopScanningRegisters: () => Promise<void>
  addReplaceServerRegister: (params: RegisterValueParameters) => void
  removeServerRegister: (params: RemoveRegisterValueParams) => void
  syncServerregisters: (params: SyncRegisterValueParams) => void
  resetRegisters: (registerType: NumberRegisters) => void
  setBool: (params: SetBooleanParameters) => void
  resetBools: (registerType: BooleanRegisters) => void
  syncBools: (params: SyncBoolsParameters) => void
  restartServer: () => Promise<void>
  setServerPort: (port: number) => Promise<void>
  setServerUnitId: (unitId: number | undefined) => Promise<void>
}

//
//
// Event
export enum IpcEvent {
  BackendMessage = 'backendMessage',
  ClientState = 'clientState',
  RegisterData = 'registerData',
  Transaction = 'transaction',
  ScanUnitIDResult = 'scanUnitIDResult',
  ScanProgress = 'ScanProgress',
  RegisterValue = 'registerValue',
  BooleanValue = 'booleanValue',
  WindowUpdate = 'windowUpdate',
  OpenServerWindow = 'openServerWindow'
}

// Scan Registers
export interface ScanRegistersParameters {
  addressRange: [number, number]
  length: number
  timeout: number
}

//
//
// Scan Unit ID parameters
export interface ScanUnitIDParameters {
  range: [number, number]
  address: number
  length: number
  registerTypes: RegisterType[]
  timeout: number
}

export interface ScanUnitIDResult {
  id: number
  registerTypes: RegisterType[]
  requestedRegisterTypes: RegisterType[]
  errorMessage: {
    [RegisterType.Coils]: string
    [RegisterType.DiscreteInputs]: string
    [RegisterType.InputRegisters]: string
    [RegisterType.HoldingRegisters]: string
  }
}

//
//
// WriteParameters
export type WriteParameters = { address: number; single: boolean } & (
  | {
      type: RegisterType.Coils
      value: boolean[]
      dataType?: never
    }
  | {
      type: RegisterType.HoldingRegisters
      value: number
      dataType: DataType
    }
)

//
//
// Client state
export interface ClientState {
  connectState: ConnectState
  polling: boolean
  scanningUniId: boolean
  scanningRegisters: boolean
}

export enum ConnectState {
  Connected = 'Connected',
  Disconnected = 'Disconnected',
  Connecting = 'Connecting',
  Disconnecting = 'Disconnecting'
}

//
//
// Backend Message
export interface BackendMessage {
  message: string
  variant: SharedProps['variant']
  error: unknown | null
}

//
//
// Protocol
export enum Protocol {
  ModbusTcp = 'ModbusTcp',
  ModbusRtu = 'ModbusRtu'
}

//
//
// Connection Config
export interface ConnectionConfig {
  protocol: Protocol
  unitId: number
  tcp: ConnectionConfigTcp
  rtu: ConnectionConfigRtu
}
interface ConnectionConfigTcp {
  host: string
  options: TcpPortOptions
}
interface ConnectionConfigRtu {
  com: string
  options: SerialPortOptions
}
export enum ModbusBaudRate {
  _1200 = 1200,
  _2400 = 2400,
  _4800 = 4800,
  _9600 = 9600,
  _14400 = 14400,
  _19200 = 19200,
  _38400 = 38400,
  _57600 = 57600,
  _115200 = 115200
}
//
//
// Register config
export enum RegisterType {
  Coils = 'Coils',
  DiscreteInputs = 'DiscreteInputs',
  HoldingRegisters = 'HoldingRegisters',
  InputRegisters = 'InputRegisters'
}
export interface RegisterConfig {
  address: number
  length: number
  type: RegisterType
  pollRate: number
  timeout: number
  littleEndian: boolean
  advancedMode: boolean
  show64BitValues: boolean
  showStringValues: boolean
  addressBase: '0' | '1'
}

//
//
// Register Data
export interface RegisterData {
  id: number
  buffer: Buffer
  hex: string
  words: RegisterDataWords | undefined
  bit: boolean
  isScanned: boolean
}

export enum DataType {
  None = 'none',
  Int16 = 'int16',
  UInt16 = 'uint16',
  Int32 = 'int32',
  UInt32 = 'uint32',
  Unix = 'unix',
  Int64 = 'int64',
  UInt64 = 'uint64',
  Float = 'float',
  Double = 'double',
  DateTime = 'datetime',
  Utf8 = 'utf8'
}

export interface RegisterDataWords {
  [DataType.Int16]: number
  [DataType.UInt16]: number
  [DataType.Int32]: number
  [DataType.UInt32]: number
  [DataType.Unix]: string
  [DataType.Float]: number
  [DataType.Int64]: bigint
  [DataType.UInt64]: bigint
  [DataType.Double]: number
  [DataType.DateTime]: string
  [DataType.Utf8]: string
}

//
//
// Transactions
export interface Transaction {
  id: string
  timestamp: number
  unitId: number
  address: number
  code: number
  responseLength: number
  timeout: boolean
  request: string
  responses: string[]
  errorMessage: string | undefined
}

export interface RawTransaction {
  nextAddress: number
  nextDataAddress: number
  nextCode: number
  nextLength: number
  // next: [Function: cb],
  _timeoutFired: boolean
  //_timeoutHandle: undefined,
  request: Buffer
  responses: Buffer[]
}

//
//
// Register Mapping
export interface RegisterMapping {
  [RegisterType.Coils]: RegisterMapObject
  [RegisterType.DiscreteInputs]: RegisterMapObject
  [RegisterType.HoldingRegisters]: RegisterMapObject
  [RegisterType.InputRegisters]: RegisterMapObject
}

export interface RegisterMapObject {
  [key: number]: RegisterMapValue | undefined
}

export interface RegisterMapValue {
  dataType?: DataType
  scalingFactor?: number
  comment?: string
}

export type BooleanRegisters = RegisterType.Coils | RegisterType.DiscreteInputs
export type NumberRegisters = RegisterType.InputRegisters | RegisterType.HoldingRegisters

//
//
// Server
// Value generator
export type RegisterValueParameters = {
  address: number
  registerType: RegisterType.InputRegisters | RegisterType.HoldingRegisters
  dataType: DataType
  littleEndian: boolean
  comment: string
} & (
  | {
      min: number
      max: number
      interval: number
      value?: never
    }
  | {
      value: number
      min?: never
      max?: never
      interval?: never
    }
)

export interface RemoveRegisterValueParams {
  registerType: RegisterType.InputRegisters | RegisterType.HoldingRegisters
  address: number
}

export interface SyncRegisterValueParams {
  registerValues: RegisterValueParameters[]
}

export interface SetBooleanParameters {
  registerType: RegisterType.Coils | RegisterType.DiscreteInputs
  address: number
  state: boolean
}

export interface SyncBoolsParameters {
  [RegisterType.Coils]: boolean[]
  [RegisterType.DiscreteInputs]: boolean[]
}

//
//
// Utils
export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<Exclude<T[K], undefined>> }
  : Exclude<T, undefined>

// ? type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
