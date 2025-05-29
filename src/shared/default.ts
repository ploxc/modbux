import {
  ConnectionConfig,
  DataType,
  Protocol,
  RegisterConfig,
  RegisterData,
  RegisterDataWords,
  RegisterType
} from './types'
import { Buffer } from 'buffer'

export const defaultConnectionConfig: ConnectionConfig = {
  unitId: 1,
  protocol: Protocol.ModbusTcp,
  tcp: {
    host: '192.168.1.10',
    options: { port: 502, timeout: 5000 }
  },
  rtu: {
    com: 'COM3',
    options: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: 'none' }
  }
}
export const defaultRegisterConfig: RegisterConfig = {
  address: 0,
  length: 10,
  type: RegisterType.HoldingRegisters,
  pollRate: 1000,
  timeout: 5000,
  littleEndian: false,
  advancedMode: false,
  show64BitValues: false,
  addressBase: '0',
  showStringValues: false
}

export const dummyWords: RegisterDataWords = {
  [DataType.Int16]: 0,
  [DataType.UInt16]: 0,
  [DataType.Int32]: 0,
  [DataType.UInt32]: 0,
  [DataType.Unix]: '',
  [DataType.Float]: 0,
  [DataType.Int64]: 0n,
  [DataType.UInt64]: 0n,
  [DataType.Double]: 0,
  [DataType.DateTime]: '',
  [DataType.Utf8]: ''
}

export const getDummyRegisterData = (register: number): RegisterData => ({
  bit: false,
  hex: '0000',
  buffer: Buffer.from([0, 0]),
  id: register,
  isScanned: false,
  words: { ...dummyWords }
})
