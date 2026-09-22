// @vitest-environment happy-dom
//
// Main keeps the byte order per server now, so a write says which registers to
// encode rather than how. That only holds if main is told before it encodes
// anything, and the two places that encode are `init` and `setLittleEndian`.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SERVER_ZUSTAND_VERSION,
  MAIN_SERVER_UUID,
  SERVER_ZUSTAND_STORAGE_KEY
} from '@shared'
import { stubRenderer } from './stubRenderer'

/** Every channel the store called, in the order it called them. */
let calls: { method: string; payload: unknown }[] = []

const recordingBoundary = (): void => {
  const w = window as unknown as { api: Record<string, unknown> }
  const boundary = w.api
  w.api = new Proxy(boundary, {
    get: (target, method: string): unknown => {
      const answer = Reflect.get(target, method) as (payload: unknown) => Promise<unknown>
      return (payload: unknown): Promise<unknown> => {
        calls.push({ method, payload })
        if (method === 'createServer') return Promise.resolve(502)
        return answer(payload)
      }
    }
  })
}

/** One holding register on the default unit, so there is something to encode. */
const persisted = {
  state: {
    selectedUuid: MAIN_SERVER_UUID,
    servers: {
      [MAIN_SERVER_UUID]: {
        port: '502',
        unitId: '0',
        littleEndian: false,
        registers: {
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
                  dataType: 'int32',
                  comment: '',
                  value: 1
                }
              }
            }
          }
        },
        usedAddresses: { '0': { holding_registers: [10], input_registers: [] } }
      }
    }
  },
  version: CURRENT_SERVER_ZUSTAND_VERSION
}

const methods = (): string[] => calls.map((call) => call.method)

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls = []
  stubRenderer()
  recordingBoundary()
  localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(persisted))
})

describe('who tells main the byte order', () => {
  it('init says it before it sends the registers', async () => {
    const { useServerZustand } = await import('../server.zustand')

    await useServerZustand.getState().init()

    expect(methods()).toContain('setServerEndianness')
    expect(methods().indexOf('setServerEndianness')).toBeLessThan(
      methods().indexOf('syncServerRegister')
    )
    expect(calls.find((call) => call.method === 'setServerEndianness')?.payload).toEqual({
      uuid: MAIN_SERVER_UUID,
      littleEndian: false
    })
  })

  it('setLittleEndian says it before it sends the registers', async () => {
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    await useServerZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['setServerEndianness', 'syncServerRegister'])
    expect(calls[0]?.payload).toEqual({ uuid: MAIN_SERVER_UUID, littleEndian: true })
    expect(useServerZustand.getState().servers[MAIN_SERVER_UUID]?.littleEndian).toBe(true)
  })

  it('sends the registers without saying how to encode them', async () => {
    const { useServerZustand } = await import('../server.zustand')
    await useServerZustand.getState().init()
    calls = []

    await useServerZustand.getState().setLittleEndian(true)

    expect(calls.find((call) => call.method === 'syncServerRegister')?.payload).toEqual({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerValues: [
        {
          address: 10,
          registerType: 'holding_registers',
          dataType: 'int32',
          comment: '',
          value: 1
        }
      ]
    })
  })
})
