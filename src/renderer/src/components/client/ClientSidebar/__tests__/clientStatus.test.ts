import { describe, it, expect } from 'vitest'
import { defaultClientState, defaultConnectionConfig } from '@shared'
import { clientAddress, clientStatus } from '../clientStatus'

describe('clientStatus', () => {
  it.each([
    ['connecting', false, false, false, 'Connecting', 'busy', false, false],
    ['disconnecting', false, false, false, 'Disconnecting', 'busy', false, false],
    ['disconnected', false, false, false, 'Disconnected', 'idle', false, true],
    ['connected', false, false, false, 'Connected', 'ok', false, false],
    ['connected', true, false, false, 'Polling', 'ok', true, false],
    ['connected', true, true, false, 'Polling, paused: not on screen', 'ok', false, true],
    ['connected', true, false, true, 'Timeout', 'error', true, false],
    ['connected', true, true, true, 'Timeout', 'error', false, false]
  ] as const)(
    '%s, polling %s, idle %s, offline %s reads %s',
    (connectState, polling, pollIdle, offline, label, tone, pulsing, hollow) => {
      expect(
        clientStatus({ ...defaultClientState, connectState, polling, pollIdle, offline })
      ).toEqual({ label, tone, polling: pulsing, hollow })
    }
  )

  it('reads a disconnected client as disconnected though its offline flag stayed up', () => {
    const status = clientStatus({
      connectState: 'disconnected',
      polling: false,
      pollIdle: false,
      offline: true
    })
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
