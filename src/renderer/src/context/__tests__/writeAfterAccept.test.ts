// @vitest-environment happy-dom
//
// The mask fields have a radix of ',' and map '.' onto it, so `1,5` typed into
// the unit id is `NaN` by the time a setter sees it. The store used to write it
// and call main afterwards, `JSON.stringify` turned it into `null`, and the next
// launch refused the whole persisted config and reset it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegisterData } from '@shared'
import { stubRenderer } from './stubRenderer'

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
  it('leaves the unit id the store had', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setUnitId('7')
    await useClientZustand.getState().setUnitId('1,5')

    expect(useClientZustand.getState().connectionConfig.unitId).toBe(7)
  })

  it('leaves the address and the rows read at it', async () => {
    const { clientZustand, dataZustand } = await load()
    const { useClientZustand } = clientZustand
    dataZustand.useDataZustand.getState().setRegisterData(rows)

    await useClientZustand.getState().setAddress('40')
    dataZustand.useDataZustand.getState().setRegisterData(rows)
    await useClientZustand.getState().setAddress('4,0')

    expect(useClientZustand.getState().registerConfig.address).toBe(40)
    expect(dataZustand.useDataZustand.getState().registerData).toHaveLength(1)
  })
})

describe('a payload the boundary takes', () => {
  it('writes the unit id', async () => {
    const { clientZustand } = await load()

    await clientZustand.useClientZustand.getState().setUnitId('7')

    expect(clientZustand.useClientZustand.getState().connectionConfig.unitId).toBe(7)
  })

  it('writes the address and drops the rows read at the old one', async () => {
    const { clientZustand, dataZustand } = await load()
    dataZustand.useDataZustand.getState().setRegisterData(rows)

    await clientZustand.useClientZustand.getState().setAddress('40')

    expect(clientZustand.useClientZustand.getState().registerConfig.address).toBe(40)
    expect(dataZustand.useDataZustand.getState().registerData).toEqual([])
  })
})

describe('a value the field marks invalid', () => {
  /**
   * The host and the length are the two the field reads back out of the store,
   * so they are written without being sent and the input keeps what was typed.
   */
  it('keeps the half-typed host in the store and marks it invalid', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setHost('192.168.', false)

    expect(useClientZustand.getState().connectionConfig.tcp.host).toBe('192.168.')
    expect(useClientZustand.getState().valid.host).toBe(false)
  })

  it('keeps an empty length in the store and marks it invalid', async () => {
    const { clientZustand } = await load()
    const { useClientZustand } = clientZustand

    await useClientZustand.getState().setLength('', false)

    expect(useClientZustand.getState().valid.lenght).toBe(false)
  })
})
