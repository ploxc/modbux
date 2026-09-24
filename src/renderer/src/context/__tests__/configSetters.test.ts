// @vitest-environment happy-dom
//
// Nine setters that differ in nothing but a key were written out nine times,
// and a fold over the key is a fold that can send the wrong one: the store
// would still write the field the caller named while main got another. Each
// case here names both halves, the payload that went out and the field that
// came back.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall, clientPayload } from './stubRenderer'
import { selectedClient } from '../client.zustand.helpers'

const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useLiveZustand: typeof import('../live.zustand').useLiveZustand
}> => ({
  useClientZustand: (await import('../client.zustand')).useClientZustand,
  useLiveZustand: (await import('../live.zustand')).useLiveZustand
})

let calls: ApiCall[]

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  calls = []
})

/** The last payload the named channel carried, or undefined if it never ran. */
const lastPayload = (method: string): unknown => {
  const call = calls.filter((candidate) => candidate.method === method).at(-1)
  return call && clientPayload(call.payload)
}

describe('the four serial options', () => {
  it('each send their own key under rtu.options and write it back', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    await useClientZustand.getState().setBaudRate('19200')
    expect(lastPayload('updateConnectionConfig')).toEqual({
      rtu: { options: { baudRate: '19200' } }
    })

    await useClientZustand.getState().setParity('even')
    expect(lastPayload('updateConnectionConfig')).toEqual({ rtu: { options: { parity: 'even' } } })

    await useClientZustand.getState().setDataBits(7)
    expect(lastPayload('updateConnectionConfig')).toEqual({ rtu: { options: { dataBits: 7 } } })

    await useClientZustand.getState().setStopBits(2)
    expect(lastPayload('updateConnectionConfig')).toEqual({ rtu: { options: { stopBits: 2 } } })

    const { options } = selectedClient(useClientZustand.getState()).connectionConfig.rtu
    expect(options).toEqual({ baudRate: '19200', parity: 'even', dataBits: 7, stopBits: 2 })
  })

  it('write nothing while a connection stands', async () => {
    const { useClientZustand, useLiveZustand } = await load()
    const before = selectedClient(useClientZustand.getState()).connectionConfig.rtu.options.baudRate
    useLiveZustand.getState().setClientState(MAIN_CLIENT_UUID, {
      ...defaultClientState,
      connectState: 'connected'
    })
    recordApiCalls(calls)

    await useClientZustand.getState().setBaudRate('19200')

    expect(lastPayload('updateConnectionConfig')).toBeUndefined()
    expect(selectedClient(useClientZustand.getState()).connectionConfig.rtu.options.baudRate).toBe(
      before
    )
  })
})

describe('the five register config fields', () => {
  it('each send their own key and write it back', async () => {
    const { useClientZustand } = await load()
    recordApiCalls(calls)

    await useClientZustand.getState().setAddressBase('1')
    expect(lastPayload('updateRegisterConfig')).toEqual({ addressBase: '1' })

    await useClientZustand.getState().setShow64BitValues(true)
    expect(lastPayload('updateRegisterConfig')).toEqual({ show64BitValues: true })

    await useClientZustand.getState().setAdvancedMode(true)
    expect(lastPayload('updateRegisterConfig')).toEqual({ advancedMode: true })

    await useClientZustand.getState().setPollRate(2000)
    expect(lastPayload('updateRegisterConfig')).toEqual({ pollRate: 2000 })

    await useClientZustand.getState().setTimeout(3000)
    expect(lastPayload('updateRegisterConfig')).toEqual({ timeout: 3000 })

    const { registerConfig } = selectedClient(useClientZustand.getState())
    expect(registerConfig.addressBase).toBe('1')
    expect(registerConfig.show64BitValues).toBe(true)
    expect(registerConfig.advancedMode).toBe(true)
    expect(registerConfig.pollRate).toBe(2000)
    expect(registerConfig.timeout).toBe(3000)
  })

  // `ReadTimingSchema` is `multipleOf(1000)`, so 1500 is a value the boundary
  // refuses and the field is one no mask holds to that step.
  it('keep the value they had when main refuses the payload', async () => {
    const { useClientZustand } = await load()
    await useClientZustand.getState().setPollRate(2000)

    await useClientZustand.getState().setPollRate(1500)

    expect(selectedClient(useClientZustand.getState()).registerConfig.pollRate).toBe(2000)
  })
})
