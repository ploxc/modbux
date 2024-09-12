import ModbusRTU from 'modbus-serial'
import { TcpPortOptions, SerialPortOptions } from 'modbus-serial/ModbusRTU'

declare global {
  interface Api {
    connectionConfig: ConnectionConfig
    updateConnectionConfig: (config: DeepMap<ConnectionConfig>) => void
    registerConfig: RegisterConfig
    updateRegisterConfig: (config: DeepMap<RegisterConfig>) => void
    read: (address: number, length: number, swap?: boolean) => Promise<RegisterData[]>
  }

  //
  //
  // Connection Config
  type Protocol = 'ModbusTcp' | 'ModbusRtu'
  interface ConnectionConfig {
    protocol: Protocol
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
  //
  interface RegisterConfig {
    address: number
    length: number
  }

  //
  //
  // Register Data
  interface RegisterData {
    id: number
    buffer: ArrayBuffer
    hex: string
    bigEndian: RegisterDataEndian
    littleEndian: RegisterDataEndian
  }
  interface RegisterDataEndian {
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
  type DeepMap<T, V> = T extends undefined
    ? undefined
    : T extends object
      ? { [K in keyof T]: DeepMap<T[K], V> }
      : V
}

export { Protocol }
