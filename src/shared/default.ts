import { ConnectionConfig, Protocol, RegisterConfig, RegisterType } from './types'

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
  littleEndian: false
}
