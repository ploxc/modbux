import { TcpPortOptions, SerialPortOptions } from 'modbus-serial/ModbusRTU'
import { SharedProps } from 'notistack'

//
//
// Api
export interface Api {
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
}

//
//
// Event
export enum IpcEvent {
  BackendMessage = 'backendMessage',
  ClientState = 'clientState',
  RegisterData = 'registerData'
}

//
//
// Client state
export interface ClientState {
  connectState: ConnectState
  polling: boolean
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
  swap: boolean
}

//
//
// Register Data
export interface RegisterData {
  id: number
  buffer: ArrayBuffer
  hex: string
  words: RegisterDataWords | undefined
  byte: [boolean, boolean, boolean, boolean, boolean, boolean, boolean, boolean] | undefined
}
export interface RegisterDataWords {
  int16: number
  uint16: number
  int32: number
  uint32: number
  int64: bigint
  uint64: bigint
  float: number
  double: number
}
//
//
// Utils
export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<Exclude<T[K], undefined>> }
  : Exclude<T, undefined>

// ? type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
