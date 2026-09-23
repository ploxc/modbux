import { describe, it, expect } from 'vitest'
import { ConnectionConfig, transportKey } from '../types/client'
import { defaultConnectionConfig } from '../default'

const config = (change: Partial<ConnectionConfig>): ConnectionConfig => ({
  ...structuredClone(defaultConnectionConfig),
  ...change
})

describe('transportKey', () => {
  it('names one serial port the same whatever the unit id or the line settings', () => {
    const first = config({
      protocol: 'ModbusRtu',
      unitId: 1,
      rtu: {
        com: 'COM3',
        options: { baudRate: '9600', parity: 'none', dataBits: 8, stopBits: 1 }
      }
    })
    const second = config({
      protocol: 'ModbusRtu',
      unitId: 2,
      rtu: {
        com: 'COM3',
        options: { baudRate: '19200', parity: 'even', dataBits: 8, stopBits: 1 }
      }
    })
    expect(transportKey(first)).toBe(transportKey(second))
  })

  it('names two serial ports apart', () => {
    const rtu = defaultConnectionConfig.rtu
    expect(transportKey(config({ protocol: 'ModbusRtu', rtu: { ...rtu, com: 'COM3' } }))).not.toBe(
      transportKey(config({ protocol: 'ModbusRtu', rtu: { ...rtu, com: 'COM4' } }))
    )
  })

  it('names one host and port the same, and the port apart', () => {
    const at = (port: number): ConnectionConfig =>
      config({ protocol: 'ModbusTcp', tcp: { host: '10.0.0.1', options: { port } } })
    expect(transportKey({ ...at(502), unitId: 7 })).toBe(transportKey(at(502)))
    expect(transportKey(at(502))).not.toBe(transportKey(at(503)))
  })

  it('reads a port name and a host name without case or the spaces around them', () => {
    const rtu = defaultConnectionConfig.rtu
    expect(transportKey(config({ protocol: 'ModbusRtu', rtu: { ...rtu, com: 'COM3' } }))).toBe(
      transportKey(config({ protocol: 'ModbusRtu', rtu: { ...rtu, com: ' com3' } }))
    )
    const at = (host: string): ConnectionConfig =>
      config({ protocol: 'ModbusTcp', tcp: { host, options: { port: 502 } } })
    expect(transportKey(at('PLC.local'))).toBe(transportKey(at('plc.local ')))
  })

  it('names TCP and RTU over TCP to one host apart, because the framing differs', () => {
    const tcp = { host: '10.0.0.1', options: { port: 502 } }
    expect(transportKey(config({ protocol: 'ModbusTcp', tcp }))).not.toBe(
      transportKey(config({ protocol: 'ModbusRtuOverTcp', tcp }))
    )
  })

  it('reads no host for a serial port, and no port name for TCP', () => {
    const serial = config({ protocol: 'ModbusRtu' })
    expect(transportKey({ ...serial, tcp: { host: 'elsewhere', options: { port: 1 } } })).toBe(
      transportKey(serial)
    )
    const tcp = config({ protocol: 'ModbusTcp' })
    expect(transportKey({ ...tcp, rtu: { ...tcp.rtu, com: 'COM9' } })).toBe(transportKey(tcp))
  })
})
