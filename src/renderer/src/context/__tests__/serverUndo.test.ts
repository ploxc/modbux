// @vitest-environment happy-dom
//
// A server step replays through the store's own actions, and a step that
// changes what a unit holds hands main the difference, register by register.
// What a master or a generator wrote is no step, and a unit put back keeps it
// wherever the register is the same one.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID, RegisterParams } from '@shared'
import { fireEvent, recordApiCalls, stubRenderer, type ApiCall } from './stubRenderer'
import { getDefaultServer } from '../server.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const SECOND_UUID = 'the-server-on-503'

let calls: ApiCall[]

/** Answers one channel differently from the stub, and leaves the rest to it. */
const answerWith = (method: string, answer: (payload: unknown) => Promise<unknown>): void => {
  const underneath = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    { get: (_target, name: string): unknown => (name === method ? answer : underneath[name]) }
  ) as never
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  // Main binds what it is asked for, and answers the port it holds.
  answerWith('createServer', (payload) => Promise.resolve((payload as { port: number }).port))
  answerWith('setServerPort', (payload) => Promise.resolve((payload as { port: number }).port))
  calls = []
  recordApiCalls(calls)
})

const holding = (address: number, comment: string): RegisterParams => ({
  address,
  registerType: 'holding_registers',
  dataType: 'uint16',
  value: 7,
  comment
})

const load = async (): Promise<{
  server: () => ReturnType<typeof import('../server.zustand').useServerZustand.getState>
  undo: () => ReturnType<typeof import('../undo.zustand').useUndoZustand.getState>
  serverUndo: typeof import('../serverUndo')
}> => {
  const { useServerZustand } = await import('../server.zustand')
  const { useUndoZustand } = await import('../undo.zustand')
  const serverUndo = await import('../serverUndo')
  useServerZustand.setState({
    selectedUuid: MAIN_SERVER_UUID,
    servers: {
      [MAIN_SERVER_UUID]: { ...getDefaultServer(), port: '502' },
      [SECOND_UUID]: { ...getDefaultServer(), port: '503' }
    },
    ready: { [MAIN_SERVER_UUID]: true, [SECOND_UUID]: true }
  })
  // Whatever the module's own `init` left there is not this test's.
  useUndoZustand.setState({ server: { past: [], future: [], openKey: undefined } })
  return {
    server: () => useServerZustand.getState(),
    undo: () => useUndoZustand.getState(),
    serverUndo
  }
}

/** The payload the named channel carried last. */
const lastPayload = (method: string): unknown =>
  calls.filter((call) => call.method === method).at(-1)?.payload

describe('a unit', () => {
  it('loses a coil that was added, in the store and in main, and gets it back on redo', async () => {
    const { server, serverUndo } = await load()
    server().addBool('coils', 3)

    expect(await serverUndo.undoServer()).toBe('done')
    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]).toBeUndefined()
    expect((lastPayload('syncBools') as { coils: boolean[] }).coils[3]).toBe(false)

    expect(await serverUndo.redoServer()).toBe('done')
    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]).toEqual({ value: false })
  })

  it('keeps the value a master wrote into a coil since', async () => {
    const { server, undo, serverUndo } = await load()
    server().addBool('coils', 5)
    server().addBool('coils', 3)
    const steps = undo().server.past.length
    server().setBool({
      registerType: 'coils',
      address: 5,
      boolState: true,
      optionalUuid: MAIN_SERVER_UUID,
      optionalUnitId: '0'
    })
    expect(undo().server.past).toHaveLength(steps)

    await serverUndo.undoServer()

    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[5]).toEqual({ value: true })
    expect((lastPayload('syncBools') as { coils: boolean[] }).coils[5]).toBe(true)
  })

  it('gets a removed register back, and hands main that register alone', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(20, 'b') })
    server().removeRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerType: 'holding_registers',
      address: 10,
      dataType: 'uint16',
      length: undefined
    })
    calls.length = 0

    await serverUndo.undoServer()

    expect(
      server().servers[MAIN_SERVER_UUID]?.registers['0']?.holding_registers[10]?.params
    ).toEqual(holding(10, 'a'))
    expect(server().servers[MAIN_SERVER_UUID]?.usedAddresses['0']?.holding_registers).toContain(10)
    expect(calls.map((call) => call.method)).toEqual(['addReplaceServerRegister'])
    expect((lastPayload('addReplaceServerRegister') as { params: RegisterParams }).params).toEqual(
      holding(10, 'a')
    )
  })

  it('keeps the value a master wrote into a register the step never touched', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    server().addBool('coils', 3)
    // After the step, so the value it holds is not the one it took.
    server().setRegisterValue({
      registerType: 'holding_registers',
      address: 10,
      value: 99,
      optionalUuid: MAIN_SERVER_UUID,
      optionalUnitId: '0'
    })
    calls.length = 0

    await serverUndo.undoServer()

    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.holding_registers[10]?.value).toBe(
      99
    )
    expect(calls.map((call) => call.method)).toEqual(['syncBools'])
  })

  it('shows what main holds for a register it got back, not the value from before', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    server().setRegisterValue({
      registerType: 'holding_registers',
      address: 10,
      value: 99,
      optionalUuid: MAIN_SERVER_UUID,
      optionalUnitId: '0'
    })
    server().removeRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      registerType: 'holding_registers',
      address: 10,
      dataType: 'uint16',
      length: undefined
    })
    // Main adds it back at its configured value and answers with that word.
    answerWith('addReplaceServerRegister', () => Promise.resolve([7]))

    await serverUndo.undoServer()

    await vi.waitFor(() =>
      expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.holding_registers[10]?.value).toBe(
        7
      )
    )
  })

  it('records nothing for a reset of a unit nothing was ever written into', async () => {
    const { server, undo } = await load()

    server().resetBools('coils')
    server().resetRegisters('holding_registers')

    expect(undo().server.past).toEqual([])
  })

  it('records nothing for a coil that was there already', async () => {
    const { server, undo } = await load()
    server().addBool('coils', 3)

    server().addBool('coils', 3)

    expect(undo().server.past).toHaveLength(1)
  })

  it('is refused for a server the store no longer holds', async () => {
    const { server, undo, serverUndo } = await load()
    const { useServerZustand } = await import('../server.zustand')
    server().addBool('coils', 3)
    // Written outside the stack, which no step describes.
    useServerZustand.setState({
      servers: { [SECOND_UUID]: { ...getDefaultServer(), port: '503' } }
    })

    expect(await serverUndo.undoServer()).toBe('refused')
    expect(undo().server.past).toHaveLength(1)
  })

  it('shows the server and the unit the step belongs to', async () => {
    const { server, serverUndo } = await load()
    server().addBool('coils', 3)
    server().setSelectedUuid(SECOND_UUID)

    await serverUndo.undoServer()

    expect(server().selectedUuid).toBe(MAIN_SERVER_UUID)
  })
})

describe('the split out window closing', () => {
  it('empties the steps this window held, which describe the store from before', async () => {
    const { server, undo } = await load()
    server().addBool('coils', 3)

    fireEvent('window_update', { server: true })
    fireEvent('window_update', { server: false })

    expect(undo().server.past).toEqual([])
  })
})

describe('a coil the user switched', () => {
  it('switches back, while a switch main made records nothing', async () => {
    const { server, undo, serverUndo } = await load()
    server().addBool('coils', 3)
    server().toggleBool('coils', 3)
    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]?.value).toBe(true)

    await serverUndo.undoServer()

    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]?.value).toBe(false)
    expect(undo().server.past).toHaveLength(1)
  })
})

describe('a server field', () => {
  it('undoes a typed name in one step', async () => {
    const { server, serverUndo } = await load()
    for (const typed of ['b', 'bo', 'boiler']) server().setName(typed)

    await serverUndo.undoServer()

    expect(server().servers[MAIN_SERVER_UUID]?.name).toBe('')
  })

  it('puts the port back', async () => {
    const { server, serverUndo } = await load()
    await server().setPort('1502')

    expect(await serverUndo.undoServer()).toBe('done')
    expect(server().servers[MAIN_SERVER_UUID]?.port).toBe('502')
  })

  it('is refused when main keeps the port it had, and the step stays', async () => {
    const { server, undo, serverUndo } = await load()
    await server().setPort('1502')
    answerWith('setServerPort', () => Promise.resolve(1502))

    expect(await serverUndo.undoServer()).toBe('refused')
    expect(server().servers[MAIN_SERVER_UUID]?.port).toBe('1502')
    expect(undo().server.past).toHaveLength(1)
  })
})

describe('a whole server', () => {
  it('is gone again after an undo of its creation, and back on redo', async () => {
    const { server, serverUndo } = await load()
    await server().createServer({ uuid: 'a-new-one', port: 1504 })

    await serverUndo.undoServer()
    expect(server().servers['a-new-one']).toBeUndefined()

    await serverUndo.redoServer()
    expect(server().servers['a-new-one']?.port).toBe('1504')
  })

  it('comes back after a delete, with its name and its registers', async () => {
    const { server, serverUndo } = await load()
    server().setSelectedUuid(SECOND_UUID)
    server().setName('second')
    server().addBool('coils', 3)
    await server().deleteServer(SECOND_UUID)

    await serverUndo.undoServer()

    const restored = server().servers[SECOND_UUID]
    expect(restored?.name).toBe('second')
    expect(restored?.registers['0']?.coils[3]).toEqual({ value: false })
    expect(restored?.port).toBe('503')
  })

  it('is one step for Clear, which puts the name and the registers back', async () => {
    const { server, undo, serverUndo } = await load()
    server().setName('boiler')
    server().addBool('coils', 3)
    const steps = undo().server.past.length

    await serverUndo.asOneServerStep(MAIN_SERVER_UUID, async () => {
      server().setName('')
      await server().resetServer(MAIN_SERVER_UUID)
    })
    expect(undo().server.past).toHaveLength(steps + 1)

    await serverUndo.undoServer()
    expect(server().servers[MAIN_SERVER_UUID]?.name).toBe('boiler')
    expect(server().servers[MAIN_SERVER_UUID]?.registers['0']?.coils[3]).toEqual({ value: false })
  })

  it('records nothing for a Clear of a server that holds nothing', async () => {
    const { server, undo, serverUndo } = await load()
    server().resetBools('coils')

    await serverUndo.asOneServerStep(MAIN_SERVER_UUID, async () => {
      server().setName('')
      await server().resetServer(MAIN_SERVER_UUID)
    })

    expect(undo().server.past).toEqual([])
  })

  it('records nothing when the main server is created, which has no Delete', async () => {
    const { server, undo } = await load()

    await server().createServer({ uuid: MAIN_SERVER_UUID, port: 502 })

    expect(undo().server.past).toEqual([])
  })
})

describe('a move in the register dialog', () => {
  it('is one step for the remove and the add', async () => {
    const { server, undo, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    const steps = undo().server.past.length

    await serverUndo.asOneServerUnitStep(MAIN_SERVER_UUID, '0', async () => {
      server().removeRegister({
        uuid: MAIN_SERVER_UUID,
        unitId: '0',
        registerType: 'holding_registers',
        address: 10,
        dataType: 'uint16',
        length: undefined
      })
      await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(30, 'a') })
    })
    expect(undo().server.past).toHaveLength(steps + 1)

    await serverUndo.undoServer()
    const registers = server().servers[MAIN_SERVER_UUID]?.registers['0']?.holding_registers
    expect(Object.keys(registers ?? {})).toEqual(['10'])
  })
})
