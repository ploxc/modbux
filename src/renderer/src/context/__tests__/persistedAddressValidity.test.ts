// @vitest-environment happy-dom
//
// `partialize` persists `connectionConfig` and not `valid`, so a blank COM port
// or a half typed host went to disk while the flag that says main never got it
// did not. The next launch came up with the field showing that text and the
// flag reading true, and Connect took a press on it. The flag is read off the
// value now, which is what the two fields decide about a value and what disk
// carries.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from './stubRenderer'
import { selectedClient, selectedSession, selectedUnit } from '../client.zustand.helpers'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

/** A stored client config naming `host` over TCP and `com` over RTU. */
const stored = (host: string, com: string, length = 10): void => {
  localStorage.setItem(
    'client.zustand',
    JSON.stringify({
      state: {
        name: 'bench',
        registerConfig: {
          address: 0,
          length,
          type: 'holding_registers',
          pollRate: 1000,
          timeout: 1000,
          littleEndian: false,
          addressBase: '0',
          show64BitValues: false,
          advancedMode: false
        },
        connectionConfig: {
          protocol: 'ModbusRtu',
          unitId: 1,
          tcp: { host, options: { port: 502, timeout: 5000 } },
          rtu: {
            com,
            options: { baudRate: '19200', dataBits: 8, stopBits: 1, parity: 'none' }
          }
        }
      },
      version: 3
    })
  )
}

describe('the validity of a connection address off disk', () => {
  it('reads false for a blank COM port, and the text stays in the field', async () => {
    stored('127.0.0.1', '')

    const { useClientZustand } = await import('../client.zustand')

    expect(selectedSession(useClientZustand.getState()).valid.com).toBe(false)
    expect(selectedClient(useClientZustand.getState()).connectionConfig.rtu.com).toBe('')
  })

  it('reads false for a host of spaces', async () => {
    stored('   ', '/dev/ttys011')

    const { useClientZustand } = await import('../client.zustand')

    expect(selectedSession(useClientZustand.getState()).valid.host).toBe(false)
  })

  it('reads true for both when both name something', async () => {
    stored('127.0.0.1', '/dev/ttys011')

    const { useClientZustand } = await import('../client.zustand')

    expect(selectedSession(useClientZustand.getState()).valid.host).toBe(true)
    expect(selectedSession(useClientZustand.getState()).valid.com).toBe(true)
  })

  // A read length of zero is a value the schema takes, and the section keeps it.
  it('keeps a read length of zero in the section it was read in', async () => {
    stored('127.0.0.1', '/dev/ttys011', 0)

    const { useClientZustand } = await import('../client.zustand')

    expect(selectedUnit(useClientZustand.getState()).sections.holding_registers.length).toBe(0)
  })

  // A first launch has no blob, and the defaults are what the fields show.
  it('reads the defaults on a launch with nothing stored', async () => {
    const { useClientZustand } = await import('../client.zustand')
    const { connectionConfig } = selectedClient(useClientZustand.getState())
    const { valid } = selectedSession(useClientZustand.getState())

    expect(valid.host).toBe(connectionConfig.tcp.host.trim().length > 0)
    expect(valid.com).toBe(connectionConfig.rtu.com.trim().length > 0)
  })
})
