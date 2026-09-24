// @vitest-environment happy-dom
//
// The split out server window loads the same bundle as the main window, so it
// ran `server.zustand`'s module-scope `init` again. In RTU mode that restarts
// the RTU server, because `RtuServer.start` stops the running one first, and in
// either mode it sends main this window's persisted copy of every register.
// The window asks main which servers it holds instead.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SERVER_ZUSTAND_VERSION,
  MAIN_SERVER_UUID,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall } from './stubRenderer'
import { getDefaultServer } from '../server.zustand.helpers'

const SECOND = 'a-second-server'
const calls: ApiCall[] = []

const persisted = (serverMode: 'tcp' | 'rtu'): string =>
  JSON.stringify({
    state: {
      selectedUuid: MAIN_SERVER_UUID,
      servers: {
        [MAIN_SERVER_UUID]: getDefaultServer(),
        [SECOND]: { ...getDefaultServer(), port: '503' }
      },
      serverMode,
      serialConfig: {
        com: '/dev/ttyUSB0',
        options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
      }
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

/** Main holds a listener for the main server only. */
const mainHolds = (ports: Record<string, number>): void => {
  const underneath = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, name: string): unknown =>
        name === 'getServerPorts'
          ? (): Promise<unknown> => Promise.resolve(ports)
          : underneath[name]
    }
  ) as never
}

/** Waits out the module-scope work, a macrotask after every microtask. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

const load = async (
  serverMode: 'tcp' | 'rtu',
  isServerWindow: boolean
): Promise<typeof import('../server.zustand').useServerZustand> => {
  localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted(serverMode))
  stubRenderer({ isServerWindow })
  mainHolds({ [MAIN_SERVER_UUID]: 502 })
  recordApiCalls(calls)
  const { useServerZustand } = await import('../server.zustand')
  await settle()
  return useServerZustand
}

const OPENING = [
  'createServer',
  'startRtuServer',
  'setServerEndianness',
  'syncBools',
  'syncServerRegister'
]
const opened = (): string[] =>
  calls.map(({ method }) => method).filter((method) => OPENING.includes(method))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
})

describe('server.zustand in the split out server window', () => {
  it('leaves the RTU server running', async () => {
    const useServerZustand = await load('rtu', true)

    expect(opened()).toEqual([])
    expect(useServerZustand.getState().ready[MAIN_SERVER_UUID]).toBe(true)
    expect(useServerZustand.getState().initialized).toBe(true)
  })

  it('opens no TCP server, and is ready for the ones main holds', async () => {
    const useServerZustand = await load('tcp', true)

    expect(opened()).toEqual([])
    expect(useServerZustand.getState().ready).toEqual({
      [MAIN_SERVER_UUID]: true,
      [SECOND]: false
    })
    expect(useServerZustand.getState().initialized).toBe(true)
  })
})

describe('server.zustand in the main window', () => {
  it('opens every TCP server', async () => {
    await load('tcp', false)

    expect(opened().filter((method) => method === 'createServer')).toHaveLength(2)
  })

  it('starts the RTU server', async () => {
    await load('rtu', false)

    expect(opened()).toContain('startRtuServer')
  })
})
