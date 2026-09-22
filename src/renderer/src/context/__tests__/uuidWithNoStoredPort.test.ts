// @vitest-environment happy-dom
//
// A port is stored as the string the field holds, so a hand-edited key can
// carry one `PortSchema` refuses. `init` then opened the server on it, main
// answered undefined and the server stood in the toggle group with an empty
// label.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CreateServerParamsSchema,
  CURRENT_SERVER_ZUSTAND_VERSION,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { type ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'

const persisted = (port: Record<string, string>, uuids = ['u']): string =>
  JSON.stringify({
    state: {
      selectedUuid: uuids[0],
      servers: Object.fromEntries(
        uuids.map((uuid) => [
          uuid,
          {
            // A string `Number` answers NaN for, which `PortSchema` refuses.
            // `PersistedServerSchema` takes any string, so this reaches `portToOpen`.
            port: port[uuid] ?? 'nope',
            unitId: '0',
            littleEndian: false,
            registers: {},
            usedAddresses: {}
          }
        ])
      )
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

/**
 * Main answering with the port it bound, which is what the store writes.
 *
 * Parsed the way `main/ipc.ts` guards the channel, because a `NaN` is exactly
 * the payload this file is about: the boundary answers `undefined` for it and
 * the store writes nothing.
 */
const stubCreateServer = (): void => {
  const w = window as unknown as { api: Record<string, unknown> }
  const boundary = w.api
  w.api = new Proxy(boundary, {
    get: (target, method: string): unknown =>
      method === 'createServer'
        ? (payload: unknown): Promise<number | undefined> => {
            const parsed = CreateServerParamsSchema.safeParse(payload)
            return Promise.resolve(parsed.success ? parsed.data.port : undefined)
          }
        : Reflect.get(target, method)
  })
}

/** Waits out `init`, which runs from module scope with nothing awaiting it. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

const portsAskedFor = (calls: ApiCall[]): unknown[] =>
  calls.filter((call) => call.method === 'createServer').map((call) => call.payload)

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  stubCreateServer()
})

describe('a server whose port is no port', () => {
  it('is opened on the registered port when nothing holds it', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted({}))
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(portsAskedFor(calls)).toEqual([{ uuid: 'u', port: 502 }])
    expect(useServerZustand.getState().servers.u?.port).toBe('502')
  })

  // Main probes sockets, and the uuids after this one have no listener yet, so
  // a walk starting at 502 would hand this server the port the last one holds
  // and move that one along.
  it('is opened past the ports the other servers hold', async () => {
    localStorage.setItem(
      SERVER_ZUSTAND_STORAGE_KEY,
      persisted({ first: '502', last: '503' }, ['first', 'middle', 'last'])
    )
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(portsAskedFor(calls)).toEqual([
      { uuid: 'first', port: 502 },
      { uuid: 'middle', port: 504 },
      { uuid: 'last', port: 503 }
    ])
    expect(useServerZustand.getState().servers.last?.port).toBe('503')
  })
})

describe('a server whose port is one', () => {
  it('is opened on the one it holds', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted({ u: '5021' }))
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(portsAskedFor(calls)).toEqual([{ uuid: 'u', port: 5021 }])
    expect(useServerZustand.getState().servers.u?.port).toBe('5021')
  })
})
