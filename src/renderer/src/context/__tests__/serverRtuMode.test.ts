// @vitest-environment happy-dom
//
// What a store in RTU mode puts on the boundary, which is what a helper shared
// with TCP mode could quietly take away: the order `init` sends things in, the
// uuid it sends them for, and the restart a serial option asks for.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SERVER_ZUSTAND_VERSION,
  MAIN_SERVER_UUID,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { stubRenderer } from './stubRenderer'

/** Every channel the store called, in the order it called them. */
let calls: { method: string; payload: unknown }[] = []

const recordingBoundary = (rejects: string[] = []): void => {
  const w = window as unknown as { api: Record<string, unknown> }
  const boundary = w.api
  w.api = new Proxy(boundary, {
    get: (target, method: string): unknown => {
      const answer = Reflect.get(target, method) as (payload: unknown) => Promise<unknown>
      return (payload: unknown): Promise<unknown> => {
        calls.push({ method, payload })
        if (rejects.includes(method)) return Promise.reject(new Error(`${method} refused`))
        if (method === 'createServer') return Promise.resolve(502)
        return answer(payload)
      }
    }
  })
}

const methods = (): string[] => calls.map((call) => call.method)
const payloadOf = (method: string): unknown => calls.find((call) => call.method === method)?.payload

/**
 * Runs out the restart a setter floated.
 *
 * A setter answers void and leaves a promise chain behind it, so a `waitFor` on
 * the calls it has made so far passes on the half of the chain that has run.
 * A timeout of 0 is a macrotask, and every pending microtask goes first.
 */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** One holding register on the default unit, so there is something to send. */
const persisted = (com: string): string =>
  JSON.stringify({
    state: {
      selectedUuid: 'a-second-server',
      uuids: [MAIN_SERVER_UUID],
      serverRegisters: {
        [MAIN_SERVER_UUID]: {
          '0': {
            coils: {},
            discrete_inputs: {},
            input_registers: {},
            holding_registers: {
              10: {
                value: 1,
                params: {
                  address: 10,
                  registerType: 'holding_registers',
                  dataType: 'uint16',
                  comment: '',
                  value: 1
                }
              }
            }
          }
        }
      },
      usedAddresses: {
        [MAIN_SERVER_UUID]: { '0': { holding_registers: [10], input_registers: [] } }
      },
      port: { [MAIN_SERVER_UUID]: '502' },
      unitId: { [MAIN_SERVER_UUID]: '0' },
      name: {},
      littleEndian: { [MAIN_SERVER_UUID]: true },
      serverMode: 'rtu',
      serialConfig: { com, options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' } }
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls = []
  stubRenderer()
})

describe('init in RTU mode', () => {
  it('opens the port, then sends the main server everything it holds', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    calls = []

    await useServerZustand.getState().init()

    expect(methods()).toEqual([
      'startRtuServer',
      'setServerEndianness',
      'syncBools',
      'syncServerRegister'
    ])
    expect(payloadOf('startRtuServer')).toEqual({
      uuid: MAIN_SERVER_UUID,
      serialConfig: {
        com: '/dev/ttyUSB0',
        options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
      }
    })
    expect(payloadOf('setServerEndianness')).toEqual({
      uuid: MAIN_SERVER_UUID,
      littleEndian: true
    })
  })

  it('marks the main server ready and selects it', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().init()

    expect(useServerZustand.getState().ready[MAIN_SERVER_UUID]).toBe(true)
    expect(useServerZustand.getState().selectedUuid).toBe(MAIN_SERVER_UUID)
  })

  it('sends the registers anyway when no COM port is configured', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted(''))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    calls = []

    await useServerZustand.getState().init()

    expect(methods()).toEqual(['setServerEndianness', 'syncBools', 'syncServerRegister'])
    expect(useServerZustand.getState().ready[MAIN_SERVER_UUID]).toBe(true)
  })

  it('opens no TCP server', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().init()

    expect(methods()).not.toContain('createServer')
  })
})

describe('a serial option changed in RTU mode', () => {
  it('is stored and restarts the server on the new value', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    useServerZustand.getState().setServerBaudRate('19200')
    await settle()

    expect(methods()).toEqual(['stopRtuServer', 'startRtuServer'])
    expect(useServerZustand.getState().serialConfig?.options.baudRate).toBe('19200')
    expect(payloadOf('startRtuServer')).toEqual({
      uuid: MAIN_SERVER_UUID,
      serialConfig: {
        com: '/dev/ttyUSB0',
        options: { baudRate: '19200', dataBits: 8, stopBits: 1, parity: 'none' }
      }
    })
  })

  it('carries the parity, the data bits and the stop bits the same way', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    useServerZustand.getState().setServerParity('even')
    useServerZustand.getState().setServerDataBits(7)
    useServerZustand.getState().setServerStopBits(2)
    await settle()

    expect(methods().filter((method) => method === 'startRtuServer')).toHaveLength(3)
    expect(useServerZustand.getState().serialConfig?.options).toEqual({
      baudRate: '9600',
      dataBits: 7,
      stopBits: 2,
      parity: 'even'
    })
  })

  it('takes the port down without opening it again when the COM field is empty', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted(''))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    useServerZustand.getState().setServerBaudRate('19200')
    await settle()

    expect(methods()).toEqual(['stopRtuServer'])
    expect(useServerZustand.getState().serialConfig?.options.baudRate).toBe('19200')
  })

  it('keeps the value when the restart fails', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary(['stopRtuServer'])
    const { useServerZustand } = await import('../server.zustand')
    calls = []

    useServerZustand.getState().setServerBaudRate('19200')
    await settle()

    expect(methods()).toEqual(['stopRtuServer'])
    expect(useServerZustand.getState().serialConfig?.options.baudRate).toBe('19200')
  })
})

describe('a serial option changed in TCP mode', () => {
  it('is stored and touches no RTU server', async () => {
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    useServerZustand.getState().setServerBaudRate('19200')
    await settle()

    expect(useServerZustand.getState().serialConfig?.options.baudRate).toBe('19200')
    expect(methods()).toEqual([])
  })
})

// The toggle awaits these two and nothing else calls them. Each one takes the
// transport it is leaving down before it writes the mode, because `init` reads
// the mode to decide what to open.
describe('switching the server between the two modes', () => {
  it('takes every TCP listener down, then opens the serial port', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    useServerZustand.setState({ serverMode: 'tcp' })
    calls = []

    await useServerZustand.getState().switchToRtu()

    expect(methods()).toEqual([
      'stopAllTcpServers',
      'startRtuServer',
      'setServerEndianness',
      'syncBools',
      'syncServerRegister'
    ])
    expect(useServerZustand.getState().serverMode).toBe('rtu')
  })

  it('takes the serial port down, then opens the TCP listener again', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted('/dev/ttyUSB0'))
    recordingBoundary()
    const { useServerZustand } = await import('../server.zustand')
    calls = []

    await useServerZustand.getState().switchToTcp()

    expect(methods()).toEqual([
      'stopRtuServer',
      'createServer',
      'setServerEndianness',
      'syncBools',
      'syncServerRegister'
    ])
    expect(useServerZustand.getState().serverMode).toBe('tcp')
  })
})
