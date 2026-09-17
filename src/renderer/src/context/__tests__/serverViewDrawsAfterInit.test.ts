// @vitest-environment happy-dom
//
// `containers/Server.tsx` fades the whole server view in on one flag. It read
// `ready`, which `syncUuidToBackend` writes only for a uuid whose sync got
// through, and `init` sets every uuid false before its loop. So a rejected
// invoke anywhere in that loop left the view blank on that launch and on every
// one after it, with nothing on screen to clear the config with. The four
// verdicts in `tmp/audit-2` that end in a blank server view all end here.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SERVER_ZUSTAND_VERSION,
  MAIN_SERVER_UUID,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { stubRenderer } from './stubRenderer'

/** A blob with one server holding one register, so `init` has a sync to make. */
const persisted = (): string =>
  JSON.stringify({
    state: {
      selectedUuid: MAIN_SERVER_UUID,
      uuids: [MAIN_SERVER_UUID],
      port: { [MAIN_SERVER_UUID]: '502' },
      name: { [MAIN_SERVER_UUID]: 'bench' },
      unitId: { [MAIN_SERVER_UUID]: '0' },
      littleEndian: { [MAIN_SERVER_UUID]: false },
      usedAddresses: {},
      serverRegisters: {
        [MAIN_SERVER_UUID]: {
          '0': {
            coils: {},
            discrete_inputs: {},
            input_registers: {},
            holding_registers: {
              '0': {
                value: 1,
                params: {
                  address: 0,
                  registerType: 'holding_registers',
                  dataType: 'uint16',
                  comment: '',
                  value: 1
                }
              }
            }
          }
        }
      }
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

/** Main answering the port it bound, which is what `init` continues past. */
const stubCreateServer = (port: number): void => {
  const boundary = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(boundary, {
    get: (target, method: string): unknown =>
      method === 'createServer'
        ? (): Promise<number> => Promise.resolve(port)
        : Reflect.get(target, method)
  }) as never
}

/** Makes one channel reject, the way a handler that throws does. */
const rejectChannel = (method: string): void => {
  const boundary = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    {
      get: (_target, asked: string): unknown => {
        if (asked === 'isServerWindow') return boundary[asked]
        if (asked !== method) return boundary[asked]
        return (): Promise<never> => Promise.reject(new Error(`${method} threw`))
      }
    }
  ) as never
}

/** Waits out `init`, which runs from module scope with nothing awaiting it. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, persisted())
})

describe('the flag the server view draws on', () => {
  it('is set once init has run', async () => {
    stubCreateServer(502)
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(useServerZustand.getState().initialized).toBe(true)
    expect(useServerZustand.getState().ready[MAIN_SERVER_UUID]).toBe(true)
  })

  it('is set even when a register main refuses rejects the sync', async () => {
    stubCreateServer(502)
    rejectChannel('syncServerRegister')
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(useServerZustand.getState().initialized).toBe(true)
    // The uuid is the one that is not ready, which is what the three setters
    // refuse on, and it is the only thing the failure costs.
    expect(useServerZustand.getState().ready[MAIN_SERVER_UUID]).toBe(false)
  })

  it('is set when creating the server fails outright', async () => {
    rejectChannel('createServer')
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(useServerZustand.getState().initialized).toBe(true)
  })
})
