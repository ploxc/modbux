// @vitest-environment happy-dom
//
// `mark` and `space` were on offer until the POSIX serial binding was measured,
// so a config written before that carries one. These two run the stores against
// such a blob, because the repair is only reached if `migrate` is wired to call
// it and the version constant has moved past the blob's own.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const stubRenderer = (): void => {
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: {
      on: (): (() => void) => (): void => {},
      send: (): void => {},
      invoke: async (): Promise<undefined> => undefined
    }
  }
  w.api = new Proxy({}, { get: () => (): Promise<undefined> => Promise.resolve(undefined) })
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a client config stored with a parity the serial binding refuses', () => {
  it('comes up on none with its com port and baud rate intact', async () => {
    localStorage.setItem(
      'client.zustand',
      JSON.stringify({
        state: {
          name: 'bench',
          connectionConfig: {
            protocol: 'ModbusRtu',
            unitId: 1,
            tcp: { host: '127.0.0.1', options: { port: 502, timeout: 5000 } },
            rtu: {
              com: '/dev/ttys011',
              options: { baudRate: '19200', dataBits: 8, stopBits: 1, parity: 'mark' }
            }
          }
        },
        version: 2
      })
    )

    const { useClientZustand } = await import('../client.zustand')
    const rtu = useClientZustand.getState().connectionConfig.rtu

    expect(rtu.options.parity).toBe('none')
    expect(rtu.com).toBe('/dev/ttys011')
    expect(rtu.options.baudRate).toBe('19200')
    expect(useClientZustand.getState().configReset).toBeUndefined()
  })
})

describe('a server config stored with a parity the serial binding refuses', () => {
  it('comes up on none with its com port and baud rate intact', async () => {
    localStorage.setItem(
      'server.zustand',
      JSON.stringify({
        state: {
          serverMode: 'rtu',
          serialConfig: {
            com: '/dev/ttys012',
            options: { baudRate: '19200', dataBits: 8, stopBits: 1, parity: 'space' }
          }
        },
        version: 3
      })
    )

    const { useServerZustand } = await import('../server.zustand')
    const serialConfig = useServerZustand.getState().serialConfig

    expect(serialConfig?.options.parity).toBe('none')
    expect(serialConfig?.com).toBe('/dev/ttys012')
    expect(serialConfig?.options.baudRate).toBe('19200')
  })
})
