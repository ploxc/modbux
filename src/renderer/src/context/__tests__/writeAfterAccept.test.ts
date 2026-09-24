// @vitest-environment happy-dom
//
// The mask fields have a radix of ',' and map '.' onto it, so `1,5` typed into
// the unit id is `NaN` by the time a setter sees it. A store that wrote it and
// called main afterwards persisted `null` through `JSON.stringify`, and the
// next launch refused the whole config and reset it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState } from '@shared'
import type { RegisterData } from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall, clientPayload } from './stubRenderer'
import { selectedClient, selectedSession } from '../client.zustand.helpers'

const load = async (): Promise<{
  clientZustand: typeof import('../client.zustand')
  dataZustand: typeof import('../data.zustand')
}> => ({
  clientZustand: await import('../client.zustand'),
  dataZustand: await import('../data.zustand')
})

const rows: RegisterData[] = [
  {
    id: 0,
    buffer: new Uint8Array([0, 1]),
    hex: '0001',
    words: undefined,
    bit: false,
    isScanned: false
  }
]

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a payload the boundary refuses', () => {
  it('leaves the unit id the store had, and the rows that unit answered', async () => {
    const { clientZustand, dataZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setUnitId('7')
    dataZustand.useDataZustand.getState().setRegisterData(rows)
    await useClientZustand.getState().setUnitId('1,5')

    expect(selectedClient(useClientZustand.getState()).connectionConfig.unitId).toBe(7)
    expect(dataZustand.useDataZustand.getState().registerData).toHaveLength(1)
  })

  it('leaves the address and the rows read at it', async () => {
    const { clientZustand, dataZustand } = await load()
    const { useClientZustand } = clientZustand
    dataZustand.useDataZustand.getState().setRegisterData(rows)

    await useClientZustand.getState().setAddress('40')
    dataZustand.useDataZustand.getState().setRegisterData(rows)
    await useClientZustand.getState().setAddress('4,0')

    expect(selectedClient(useClientZustand.getState()).registerConfig.address).toBe(40)
    expect(dataZustand.useDataZustand.getState().registerData).toHaveLength(1)
  })
})

describe('a payload the boundary takes', () => {
  // A unit id names which device answers, so the rows the last one answered
  // are about another device.
  it('writes the unit id and drops the rows the old one answered', async () => {
    const { clientZustand, dataZustand } = await load()
    dataZustand.useDataZustand.getState().setRegisterData(rows)

    await clientZustand.useClientZustand.getState().setUnitId('7')

    expect(selectedClient(clientZustand.useClientZustand.getState()).connectionConfig.unitId).toBe(
      7
    )
    expect(dataZustand.useDataZustand.getState().registerData).toEqual([])
  })

  // A mount of the masked field hands the setter the id the store already
  // holds, which `integerMask.test.tsx` measures, so this is what keeps opening
  // the scan dialog or walking to Home and back from emptying the grid.
  it('keeps the rows when the unit id it is handed is the one it holds', async () => {
    const { clientZustand, dataZustand } = await load()
    const { useClientZustand } = clientZustand
    await useClientZustand.getState().setUnitId('7')
    dataZustand.useDataZustand.getState().setRegisterData(rows)
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await useClientZustand.getState().setUnitId('7')

    expect(dataZustand.useDataZustand.getState().registerData).toHaveLength(1)
    expect(calls).toEqual([])
  })

  // `clearRegisterDataWhenIdle`: a poll is about to put new rows there, and
  // emptying the grid under it is a flicker rather than an answer.
  it('keeps the rows while a poll is running', async () => {
    const { clientZustand, dataZustand } = await load()
    const { useClientZustand } = clientZustand
    dataZustand.useDataZustand.getState().setRegisterData(rows)
    dataZustand.useDataZustand.getState().setClientState({
      ...defaultClientState,
      connectState: 'connected',
      polling: true
    })

    await useClientZustand.getState().setUnitId('7')

    expect(selectedClient(useClientZustand.getState()).connectionConfig.unitId).toBe(7)
    expect(dataZustand.useDataZustand.getState().registerData).toHaveLength(1)
  })

  it('writes the address and drops the rows read at the old one', async () => {
    const { clientZustand, dataZustand } = await load()
    dataZustand.useDataZustand.getState().setRegisterData(rows)

    await clientZustand.useClientZustand.getState().setAddress('40')

    expect(selectedClient(clientZustand.useClientZustand.getState()).registerConfig.address).toBe(
      40
    )
    expect(dataZustand.useDataZustand.getState().registerData).toEqual([])
  })
})

describe('a value the field marks invalid', () => {
  /**
   * The host, the COM port and the length are the three the field reads back
   * out of the store, so they are written without being sent and the input
   * keeps what was typed.
   */
  it('keeps the half-typed host in the store and marks it invalid', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setHost('192.168.', false)

    expect(selectedClient(useClientZustand.getState()).connectionConfig.tcp.host).toBe('192.168.')
    expect(selectedSession(useClientZustand.getState()).valid.host).toBe(false)
  })

  // `ConnectionConfigRtuSchema` types `com` as a string and takes a blank one,
  // so nothing at the boundary refuses a connection config naming no port.
  it('keeps a blank COM port in the store and sends nothing', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand
    await useClientZustand.getState().setCom('COM9', true)
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await useClientZustand.getState().setCom('   ', false)

    expect(selectedClient(useClientZustand.getState()).connectionConfig.rtu.com).toBe('   ')
    expect(selectedSession(useClientZustand.getState()).valid.com).toBe(false)
    expect(calls).toEqual([])
  })

  it('sends a COM port the field accepts', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await useClientZustand.getState().setCom('COM9', true)

    expect(selectedClient(useClientZustand.getState()).connectionConfig.rtu.com).toBe('COM9')
    expect(selectedSession(useClientZustand.getState()).valid.com).toBe(true)
    expect(calls.map(({ method, payload }) => [method, clientPayload(payload)])).toEqual([
      ['updateConnectionConfig', { rtu: { com: 'COM9' } }]
    ])
  })

  it('keeps an empty length in the store and marks it invalid', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setLength('', false)

    expect(selectedSession(useClientZustand.getState()).valid.length).toBe(false)
  })
})
