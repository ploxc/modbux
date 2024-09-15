import {
  RegisterData,
  ConnectionConfig,
  RegisterConfig,
  Protocol,
  RegisterType,
  ModbusBaudRate
} from '@shared'
import { SerialPortOptions } from 'modbus-serial/ModbusRTU'

export interface RootZusand {
  registerData: RegisterData[]
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig
  ready: boolean
  init: () => Promise<void>
  //
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
  //
  addressBase: '0' | '1'
  setAddressBase: (value: '0' | '1') => void
}

export type MaskSetFn<V extends string = string> = (value: V, valid?: boolean) => void

interface Valid {
  host: boolean
  com: boolean
}
