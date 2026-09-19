// @vitest-environment happy-dom
//
// Two setters leave the grid holding something the device never answered for,
// and both put that right by asking main to read. `setReadConfiguration` fills
// the grid from the mapping, where every word is `dummyWords`. `setLittleEndian`
// leaves rows that were decoded in the other word order. Main refuses a read
// while a poll, either scan or a read already in flight owns the port, and
// again while nothing is connected, and says so in a snackbar, so neither
// setter may ask in those states.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, emptyRegisterMapping } from '@shared'
import type { ClientState, RegisterData } from '@shared'
import { ApiCall, recordApiCalls, stubRenderer } from './stubRenderer'

const calls: ApiCall[] = []

const methods = (): string[] => calls.map((call) => call.method)

const idle: ClientState = { ...defaultClientState, connectState: 'connected' }

const row: RegisterData = {
  id: 0,
  buffer: new Uint8Array([0, 0]),
  hex: '0000',
  words: undefined,
  bit: false,
  isScanned: false
}

/**
 * The stores, with the calls `init` makes at import time already dropped.
 *
 * `init` pushes both configs, turns read configuration off and asks main for
 * the client state. Every test here reads the calls one later action makes.
 */
const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useDataZustand: typeof import('../data.zustand').useDataZustand
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useDataZustand } = await import('../data.zustand')
  calls.length = 0
  return { useClientZustand, useDataZustand }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  calls.length = 0
  stubRenderer()
  recordApiCalls(calls)
})

describe('read configuration, turned on', () => {
  it('asks main to read, after main has been told the flag', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration', 'read'])
  })

  it('reads on an empty grid, which is the grid `showMapping` has yet to fill', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    useDataZustand.getState().setRegisterData([])
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration', 'read'])
  })
})

describe('read configuration, in a state main would refuse', () => {
  it('turned off, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    useClientZustand.getState().setReadConfiguration(true)
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(false)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('disconnected, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, connectState: 'disconnected' })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('while polling, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, polling: true })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('while a unit id scan runs, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, scanningUnitIds: true })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('while a register scan runs, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, scanningRegisters: true })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('while a read is in flight, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, reading: true })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })

  it('while a write is in flight, asks for nothing', async () => {
    const { useClientZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, writing: true })
    calls.length = 0

    useClientZustand.getState().setReadConfiguration(true)

    expect(methods()).toEqual(['setReadConfiguration'])
  })
})

describe('the byte order, which reads through the same rule', () => {
  it('asks for a read when rows are on screen', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    useDataZustand.getState().setRegisterData([row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig', 'read'])
  })

  it('asks for nothing on an empty grid', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    useDataZustand.getState().setRegisterData([])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a unit id scan runs', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, scanningUnitIds: true })
    useDataZustand.getState().setRegisterData([row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a read is in flight', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, reading: true })
    useDataZustand.getState().setRegisterData([row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })

  it('asks for nothing while a write is in flight', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState({ ...idle, writing: true })
    useDataZustand.getState().setRegisterData([row])
    calls.length = 0

    await useClientZustand.getState().setLittleEndian(true)

    expect(methods()).toEqual(['updateRegisterConfig'])
  })
})

/**
 * The unit id and the register type, which change what the grid is about.
 *
 * `clearRegisterDataWhenIdle` emptied the grid for both, and returned early
 * with read configuration on because the grid is drawn from the mapping there.
 * So the old unit's values stayed in the named rows under the new unit id, and
 * a type change left the rows of the type before it: `RegisterGrid` redraws
 * the mapping on a change of `readConfiguration` and not of `type`.
 */
describe('read configuration on, and the question the grid answers changes', () => {
  /** The mapping with one holding register and one coil configured. */
  const withMapping = async (
    useClientZustand: typeof import('../client.zustand').useClientZustand
  ): Promise<void> => {
    const mapping = emptyRegisterMapping()
    mapping.holding_registers['0'] = { dataType: 'uint16', comment: 'holding' }
    mapping.coils['4'] = { dataType: 'uint16', comment: 'coil' }
    await useClientZustand.getState().replaceRegisterMapping(mapping)
    useClientZustand.getState().setReadConfiguration(true)
  }

  it('a new unit id redraws the mapping and asks main to read it', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData([{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig', 'read'])
    expect(useDataZustand.getState().registerData.map((data) => data.hex)).toEqual(['0000'])
  })

  it('a new register type draws that type and asks main to read it', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    calls.length = 0

    await useClientZustand.getState().setType('coils')

    expect(methods()).toEqual(['updateRegisterConfig', 'read'])
    expect(useDataZustand.getState().registerData.map((data) => data.id)).toEqual([4])
  })

  // The refusal rule is the same one, so a state main would refuse costs the
  // ask and not the redraw: the rows on screen are the old unit's either way.
  it('a new unit id while a poll runs leaves the grid to the poll', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    useClientZustand.getState().setClientState({ ...idle, polling: true })
    useDataZustand.getState().setRegisterData([{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(useDataZustand.getState().registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  it('a new unit id while a write is in flight redraws and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    useClientZustand.getState().setClientState({ ...idle, writing: true })
    useDataZustand.getState().setRegisterData([{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(useDataZustand.getState().registerData.map((data) => data.hex)).toEqual(['0000'])
  })

  /**
   * The address and the length are not that question.
   *
   * `_read` builds its groups from the mapping and falls back to the toolbar's
   * group only when the mapping has none, so with read configuration on those
   * two change nothing about what is read. Redrawing would trade the values a
   * device answered for `showMapping`'s zeros, and on a disconnected client
   * `readWhenMainCan` asks for nothing to put back.
   */
  it('a new address leaves the rows and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData([{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setAddress('7')

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(useDataZustand.getState().registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  it('a new length leaves the rows and asks for nothing', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    await withMapping(useClientZustand)
    useDataZustand.getState().setRegisterData([{ ...row, hex: 'BEEF' }])
    calls.length = 0

    await useClientZustand.getState().setLength('7', true)

    expect(methods()).toEqual(['updateRegisterConfig'])
    expect(useDataZustand.getState().registerData.map((data) => data.hex)).toEqual(['BEEF'])
  })

  // With read configuration off the grid still empties, which is what the two
  // setters did before and what the address and length fields rely on.
  it('a new unit id with read configuration off empties the grid', async () => {
    const { useClientZustand, useDataZustand } = await load()
    useClientZustand.getState().setClientState(idle)
    useDataZustand.getState().setRegisterData([row])
    calls.length = 0

    await useClientZustand.getState().setUnitId('3')

    expect(methods()).toEqual(['updateConnectionConfig'])
    expect(useDataZustand.getState().registerData).toEqual([])
  })
})
