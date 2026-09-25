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

const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({ enqueueSnackbar }))

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
  enqueueSnackbar.mockClear()
  stubRenderer()
  // Main binds what it is asked for, and answers the port it holds.
  answerWith('createServer', (payload) => Promise.resolve((payload as { port: number }).port))
  answerWith('setServerPort', (payload) => Promise.resolve((payload as { port: number }).port))
  calls = []
  recordApiCalls(calls)
})

const holding = (address: number, comment: string, value = 7): RegisterParams => ({
  address,
  registerType: 'holding_registers',
  dataType: 'uint16',
  value,
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
  await import('../serverUndoHandover')
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

  /** A master's write into holding register 10, which is no step. */
  const masterWrites = (
    server: () => ReturnType<typeof import('../server.zustand').useServerZustand.getState>,
    value: number
  ): void =>
    server().setRegisterValue({
      registerType: 'holding_registers',
      address: 10,
      value,
      optionalUuid: MAIN_SERVER_UUID,
      optionalUnitId: '0'
    })

  /** The params main was handed last for a register. */
  const replaced = (): RegisterParams =>
    (lastPayload('addReplaceServerRegister') as { params: RegisterParams }).params

  // A value is not configuration (`tmp/roadmap.md`, one register core), so a
  // step that left the word alone hands main the word the register holds now.
  // A bit comment is that step: it sends the word held as it is made.
  it('puts a comment back and keeps the value a master wrote since', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    masterWrites(server, 99)
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: holding(10, 'b', 99)
    })
    masterWrites(server, 120)

    await serverUndo.undoServer()

    expect(replaced()).toMatchObject({ comment: 'a', value: 120 })
  })

  it('puts back a value typed in the dialog along with its comment', async () => {
    const { server, serverUndo } = await load()
    // Main answers the word it encoded, which for a uint16 is the value.
    answerWith('addReplaceServerRegister', (payload) =>
      Promise.resolve([(payload as { params: { value: number } }).params.value])
    )
    recordApiCalls(calls)
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    // Main's word waits in the 50 ms batcher, and a dialog opens after it.
    await new Promise((resolve) => setTimeout(resolve, 60))
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: holding(10, 'b', 50)
    })

    await serverUndo.undoServer()

    expect(replaced()).toMatchObject({ comment: 'a', value: 7 })
  })

  // A number cannot carry a 64 bit word above 2^53, so the step's own params go.
  it('puts a 64 bit register back with the params the step saw', async () => {
    const { server, serverUndo } = await load()
    const wide = (comment: string): RegisterParams => ({
      ...holding(10, comment),
      dataType: 'uint64'
    })
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: wide('a') })
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: wide('b') })
    masterWrites(server, 120)

    await serverUndo.undoServer()

    expect(replaced()).toMatchObject({ comment: 'a', value: 7 })
  })

  it('puts a register whose type the step changed back as the step saw it', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    masterWrites(server, 99)
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: { ...holding(10, 'a'), dataType: 'int16' }
    })

    await serverUndo.undoServer()

    expect(replaced()).toMatchObject({ dataType: 'uint16', value: 7 })
  })

  it('puts a generator back as a generator', async () => {
    const { server, serverUndo } = await load()
    const generator = (comment: string): RegisterParams => ({
      address: 10,
      registerType: 'holding_registers',
      dataType: 'uint16',
      comment,
      min: 0,
      max: 9,
      interval: 1000
    })
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: generator('a') })
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: generator('b') })

    await serverUndo.undoServer()

    expect(replaced()).toEqual(generator('a'))
  })

  it('redoes a comment step and keeps a master write made after the undo', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    masterWrites(server, 99)
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: holding(10, 'b', 99)
    })
    masterWrites(server, 120)
    await serverUndo.undoServer()
    masterWrites(server, 130)

    await serverUndo.redoServer()

    expect(replaced()).toMatchObject({ comment: 'b', value: 130 })
  })

  it('leaves a register written there while main answered the restore alone', async () => {
    const { server, serverUndo } = await load()
    const { useServerZustand } = await import('../server.zustand')
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    masterWrites(server, 99)
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: holding(10, 'b', 99)
    })
    const answers: Array<() => void> = []
    answerWith(
      'addReplaceServerRegister',
      () => new Promise((resolve) => answers.push(() => resolve([])))
    )

    const undoing = serverUndo.undoServer()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    useServerZustand.setState((state) => {
      const unit = state.servers[MAIN_SERVER_UUID]?.registers['0']
      if (!unit) throw new Error('unit 0 is gone')
      return {
        servers: {
          ...state.servers,
          [MAIN_SERVER_UUID]: {
            ...getDefaultServer(),
            ...state.servers[MAIN_SERVER_UUID],
            registers: {
              '0': {
                ...unit,
                holding_registers: { 10: { value: 5, params: holding(10, 'c', 5) } }
              }
            }
          }
        }
      }
    })
    for (const answer of answers) answer()
    await undoing

    expect(
      server().servers[MAIN_SERVER_UUID]?.registers['0']?.holding_registers[10]?.params
    ).toEqual(holding(10, 'c', 5))
  })

  // A toggle is a value the user set, so its undo puts back the word before it.
  it('puts back the word a value step replaced, not the one the register was made with', async () => {
    const { server, serverUndo } = await load()
    await server().addRegister({ uuid: MAIN_SERVER_UUID, unitId: '0', params: holding(10, 'a') })
    masterWrites(server, 99)
    await server().addRegister({
      uuid: MAIN_SERVER_UUID,
      unitId: '0',
      params: holding(10, 'a', 50)
    })

    await serverUndo.undoServer()

    expect(replaced()).toMatchObject({ comment: 'a', value: 99 })
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

    expect(await serverUndo.undoServer()).toBe('refused-gone')
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

const SERVER_UNDO_STORAGE_KEY = 'server.undo'

/** A stack as `writer` writes it, holding one name step. */
const handedOverStack = (writer: 'main' | 'server'): string =>
  JSON.stringify({
    writer,
    past: [{ kind: 'name', uuid: MAIN_SERVER_UUID, value: 'from the other window' }],
    future: [],
    openKey: undefined
  })

describe('the main window, as the server view leaves and comes back', () => {
  it('hands its steps over when the view leaves, and keeps none', async () => {
    const { server, undo } = await load()
    server().addBool('coils', 3)

    fireEvent('window_update', { server: true })

    const written = JSON.parse(localStorage.getItem(SERVER_UNDO_STORAGE_KEY) ?? '{}')
    expect(written.past).toEqual([expect.objectContaining({ kind: 'unit', unitId: '0' })])
    expect(undo().server.past).toEqual([])
  })

  it('takes the steps the other window handed back when the view returns', async () => {
    const { undo } = await load()
    fireEvent('window_update', { server: true })
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, handedOverStack('server'))

    fireEvent('window_update', { server: false })

    expect(undo().server.past).toEqual([
      { kind: 'name', uuid: MAIN_SERVER_UUID, value: 'from the other window' }
    ])
  })

  it('starts with no steps when the split out window wrote none, as after a crash', async () => {
    const { server, undo } = await load()
    server().addBool('coils', 3)
    fireEvent('window_update', { server: true })

    fireEvent('window_update', { server: false })

    expect(undo().server.past).toEqual([])
  })

  it('keeps its steps on the update main sends when no view left', async () => {
    const { server, undo } = await load()
    server().addBool('coils', 3)
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, handedOverStack('server'))

    fireEvent('window_update', { server: false })

    expect(undo().server.past).toEqual([expect.objectContaining({ kind: 'unit' })])
  })

  it('clears the key at launch, so no history outlives one', async () => {
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, handedOverStack('server'))

    await load()

    expect(localStorage.getItem(SERVER_UNDO_STORAGE_KEY)).toBeNull()
  })
})

describe('the split out window', () => {
  it('starts with the steps the main window handed over, and hands its own back', async () => {
    stubRenderer({ isServerWindow: true })
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, handedOverStack('main'))
    const { useUndoZustand } = await import('../undo.zustand')
    await import('../serverUndoHandover')

    expect(useUndoZustand.getState().server.past).toEqual([
      { kind: 'name', uuid: MAIN_SERVER_UUID, value: 'from the other window' }
    ])

    useUndoZustand.getState().setServer({ past: [], future: [], openKey: undefined })
    window.dispatchEvent(new Event('pagehide'))

    expect(JSON.parse(localStorage.getItem(SERVER_UNDO_STORAGE_KEY) ?? '{}').past).toEqual([])
  })

  it('starts with no steps on a key that is not a stack', async () => {
    stubRenderer({ isServerWindow: true })
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, '{"writer": "main", "past": "no", "future": []}')
    const { useUndoZustand } = await import('../undo.zustand')
    await import('../serverUndoHandover')

    expect(useUndoZustand.getState().server).toEqual({
      past: [],
      future: [],
      openKey: undefined
    })
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

  it('says so when it comes back on another port than it had', async () => {
    const { server, serverUndo } = await load()
    await server().deleteServer(SECOND_UUID)
    // Something took 503 meanwhile, so main walks up to the next one free.
    answerWith('createServer', () => Promise.resolve(504))

    await serverUndo.undoServer()

    expect(server().servers[SECOND_UUID]?.port).toBe('504')
    expect(enqueueSnackbar).toHaveBeenCalledWith({
      message: 'Port 503 is taken, so the server is back on port 504',
      variant: 'warning'
    })
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
