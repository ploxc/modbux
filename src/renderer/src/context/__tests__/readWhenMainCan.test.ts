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
import { defaultClientState } from '@shared'
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
