export const defaultConnectionConfig: ConnectionConfig = {
  protocol: 'ModbusTcp',
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
  address: 40000,
  length: 10
}
