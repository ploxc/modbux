import { TcpPortOptions, SerialPortOptions } from 'modbus-serial/ModbusRTU'

//
//
// Api
export interface Api {
  getConnectionConfig: () => Promise<ConnectionConfig>
  updateConnectionConfig: (config: DeepPartial<ConnectionConfig>) => void
  getRegisterConfig: () => Promise<RegisterConfig>
  updateRegisterConfig: (config: DeepPartial<RegisterConfig>) => void
  read: (address: number, length: number, swap?: boolean) => Promise<RegisterData[]>
}

//
//
// Event
export enum IpcEvent {}

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

//
//
// Register config
enum RegisterType {
  Coils = 'Coils',
  DiscreteInputs = 'DiscreteInputs',
  HoldingRegisters = 'HoldingRegisters',
  InputRegisters = 'InputRegisters'
}
export interface RegisterConfig {
  address: number
  length: number
  type: RegisterType
}

//
//
// Register Data
export interface RegisterData {
  id: number
  buffer: ArrayBuffer
  hex: string
  bigEndian: RegisterDataEndian
  littleEndian: RegisterDataEndian
}
export interface RegisterDataEndian {
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
