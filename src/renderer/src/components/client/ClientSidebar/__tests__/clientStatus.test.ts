import { describe, it, expect } from 'vitest'
import { defaultClientState, defaultConnectionConfig } from '@shared'
import { clientAddress, clientStatus } from '../clientStatus'

describe('clientStatus', () => {
  it.each([
    ['connecting', false, false, 'Connecting', 'busy'],
    ['disconnecting', false, false, 'Disconnecting', 'busy'],
    ['disconnected', false, false, 'Disconnected', 'idle'],
    ['connected', false, false, 'Connected', 'ok'],
    ['connected', true, false, 'Polling', 'ok'],
    ['connected', true, true, 'Timeout', 'error']
  ] as const)(
    '%s, polling %s, offline %s reads %s',
    (connectState, polling, offline, label, tone) => {
      expect(clientStatus({ ...defaultClientState, connectState, polling, offline })).toEqual({
        label,
        tone
      })
    }
  )

  it('reads a disconnected client as disconnected though its offline flag stayed up', () => {
    const status = clientStatus({ connectState: 'disconnected', polling: false, offline: true })
    expect(status.label).toBe('Disconnected')
  })
})

describe('clientAddress', () => {
  it('names host and port for TCP and RTU over TCP', () => {
    const tcp = { ...defaultConnectionConfig.tcp, host: '10.0.0.12', options: { port: 4001 } }
    expect(clientAddress({ ...defaultConnectionConfig, protocol: 'ModbusTcp', tcp })).toBe(
      '10.0.0.12:4001'
    )
    expect(clientAddress({ ...defaultConnectionConfig, protocol: 'ModbusRtuOverTcp', tcp })).toBe(
      '10.0.0.12:4001'
    )
  })

  it('names the COM port and its line for RTU, and says when there is no port', () => {
    const rtu = {
      com: '/dev/tty.usbserial-A10',
      options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
    } as const
    expect(clientAddress({ ...defaultConnectionConfig, protocol: 'ModbusRtu', rtu })).toBe(
      '/dev/tty.usbserial-A10 · 9600 8N1'
    )
    expect(
      clientAddress({ ...defaultConnectionConfig, protocol: 'ModbusRtu', rtu: { ...rtu, com: '' } })
    ).toBe('No COM port · 9600 8N1')
  })
})
