import {
  ClientState,
  ConnectionConfig,
  RegisterConfig,
  RegisterData,
  RegisterDataWords
} from './types'

export const defaultConnectionConfig: ConnectionConfig = {
  unitId: 1,
  protocol: 'ModbusTcp',
  tcp: {
    host: '192.168.1.10',
    options: { port: 502, timeout: 5000 }
  },
  rtu: {
    com: 'COM3',
    options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
  }
}
export const defaultRegisterConfig: RegisterConfig = {
  address: 0,
  length: 10,
  type: 'holding_registers',
  pollRate: 1000,
  timeout: 5000,
  littleEndian: false,
  advancedMode: false,
  show64BitValues: false,
  addressBase: '0',
  readConfiguration: false
}

export const defaultClientState: ClientState = {
  connectState: 'disconnected',
  polling: false,
  scanningUniId: false,
  scanningRegisters: false
}

export const dummyWords: RegisterDataWords = {
  ['int16']: 0,
  ['uint16']: 0,
  ['int32']: 0,
  ['uint32']: 0,
  ['unix']: '',
  ['float']: 0,
  ['int64']: 0n,
  ['uint64']: 0n,
  ['double']: 0,
  ['datetime']: '',
  ['utf8']: ''
}

export const getDummyRegisterData = (register: number): RegisterData => ({
  bit: false,
  hex: '0000',
  buffer: new Uint8Array([0, 0]),
  id: register,
  isScanned: false,
  words: { ...dummyWords }
})

export const MAIN_SERVER_UUID = '21794bae-26a7-488c-954c-2105cb303c59'
