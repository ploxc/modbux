// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_CLIENT_UUID, RegisterData, defaultClientState } from '@shared'
import {
  ApiCall,
  fireEvent,
  recordApiCalls,
  stubRenderer
} from '@renderer/context/__tests__/stubRenderer'

// The stores ask `window.api` as they load, so the stub goes first.
stubRenderer()
const calls: ApiCall[] = []
recordApiCalls(calls)

/**
 * The events main puts out for a call, delivered after its answer, one task
 * each, which is the order the renderer hears them in.
 */
const eventsAfter = new Map<string, Array<() => void>>()
const answering = window.api as unknown as Record<string, unknown>
window.api = new Proxy(
  {},
  {
    get: (_target, method: string): unknown => {
      const answer = answering[method]
      if (typeof answer !== 'function') return answer
      return async (payload: unknown): Promise<unknown> => {
        const answered: unknown = await (answer as (payload: unknown) => unknown)(payload)
        for (const [i, event] of (eventsAfter.get(method) ?? []).entries()) setTimeout(event, i)
        return answered
      }
    }
  }
) as never
const { answerCall } = await import('../relay')
const { holdSelection, useClientZustand } = await import('@renderer/context/client.zustand')
const { useLiveZustand } = await import('@renderer/context/live.zustand')
const { useLayoutZustand } = await import('@renderer/context/layout.zustand')
const { useSerialGroupZustand } =
  await import('@renderer/components/client/SerialGroupModal/serialGroupModal.zustand')

const client = MAIN_CLIENT_UUID

/** The answer of a tool call, or the error it gave, thrown. */
const run = async (
  tool: Parameters<typeof answerCall>[0]['tool'],
  args: object
): Promise<unknown> => {
  const answer = await answerCall({ id: 'call', tool, args })
  if (!answer.ok) throw new Error(answer.error)
  return answer.result
}

const setState = (state: Partial<typeof defaultClientState>): void =>
  useLiveZustand.getState().setClientState(client, { ...defaultClientState, ...state })

const row = (id: number, hex: string): RegisterData => ({
  id,
  buffer: new Uint8Array(2),
  hex,
  words: undefined,
  bit: false,
  isScanned: false
})

/**
 * What main puts out around each call it takes, as `modbusClient` does, led
 * by the last state of the call before it, which can land after this call.
 */
const mainEvents = (): void => {
  const echo = (): void => setState({ ...useLiveZustand.getState().clients[client]?.clientState })
  eventsAfter.set('connect', [
    echo,
    (): void => setState({ connectState: 'connecting' }),
    (): void => setState({ connectState: 'connected' })
  ])
  eventsAfter.set('disconnect', [
    echo,
    (): void => setState({ connectState: 'disconnecting' }),
    (): void => setState({})
  ])
  eventsAfter.set('read', [
    echo,
    (): void => setState({ connectState: 'connected', reading: true }),
    (): void => fireEvent('register_data', { uuid: client, registerData: [row(0, '002a')] }),
    (): void => setState({ connectState: 'connected' })
  ])
  eventsAfter.set('startPolling', [
    echo,
    (): void => setState({ connectState: 'connected', polling: true })
  ])
  eventsAfter.set('stopPolling', [echo, (): void => setState({ connectState: 'connected' })])
}

const sent = (method: string): unknown[] =>
  calls.filter((call) => call.method === method).map((call) => call.payload)

beforeEach(async () => {
  calls.length = 0
  setState({})
  // The session is made ready by `init`, which the stub's answers let run.
  await useClientZustand.getState().init()
  // A session outlives the test, and tests leave the length invalid, read
  // configuration on or a register mapped.
  await useClientZustand.getState().setLength('10', true)
  useClientZustand.getState().setReadConfiguration(false)
  await useClientZustand.getState().clearRegisterMapping()
  calls.length = 0
  mainEvents()
})

afterEach(() => {
  vi.useRealTimers()
})

/** A holding register mapped with a data type, which main hears of after a debounce. */
const mapOneRegister = (): void =>
  useClientZustand.getState().setRegisterMapping(0, 'dataType', 'int16')

describe('a client tool', () => {
  it('opens the client view from home', async () => {
    useLayoutZustand.getState().setAppType(undefined)
    await run('set_client_config', { client, length: 5 })
    expect(useLayoutZustand.getState().appType).toBe('client')
  })

  it('opens the client view from the settings', async () => {
    useLayoutZustand.getState().setAppType('settings')
    await run('set_client_config', { client, length: 5 })
    expect(useLayoutZustand.getState().appType).toBe('client')
  })

  it('leaves the view alone for a client nobody has', async () => {
    useLayoutZustand.getState().setAppType(undefined)
    await expect(run('set_client_config', { client: 'nobody', length: 5 })).rejects.toThrow()
    expect(useLayoutZustand.getState().appType).toBeUndefined()
  })
})

describe('set_client_config', () => {
  it('sets each field through its setter, in order, and names what it took', async () => {
    const answer = await run('set_client_config', {
      client,
      host: '10.0.0.9',
      port: 1502,
      unitId: 3,
      type: 'input_registers',
      address: 30000,
      length: 20
    })

    expect(answer).toEqual({
      changed: ['host', 'port', 'unitId', 'type', 'address', 'length'],
      refused: []
    })
    const persisted = useClientZustand.getState().clients[client]
    expect(persisted?.connectionConfig).toMatchObject({
      unitId: 3,
      tcp: { host: '10.0.0.9', options: { port: 1502 } }
    })
    expect(persisted?.registerConfig).toMatchObject({
      type: 'input_registers',
      address: 30000,
      length: 20
    })
  })

  // A connection field is greyed while connected; the tool is refused the same.
  it('refuses a connection field while the client is connected, and takes the rest', async () => {
    setState({ connectState: 'connected' })

    const answer = await run('set_client_config', { client, port: 1503, length: 5 })

    expect(answer).toEqual({ changed: ['length'], refused: ['port'] })
    expect(sent('updateConnectionConfig')).toEqual([])
  })

  it('refuses a value the field would refuse, and keeps the one it had', async () => {
    const answer = await run('set_client_config', { client, length: 0, host: '' })
    expect(answer).toEqual({ changed: [], refused: ['host', 'length'] })
    const persisted = useClientZustand.getState().clients[client]
    expect(persisted?.registerConfig.length).toBe(10)
    expect(persisted?.connectionConfig.tcp.host).not.toBe('')
    expect(useClientZustand.getState().sessions[client]?.valid).toMatchObject({
      host: true,
      length: true
    })
  })

  it('turns read configuration on once main has the mapping, and draws it', async () => {
    mapOneRegister()
    const answer = await run('set_client_config', { client, readConfiguration: true })
    expect(answer).toEqual({ changed: ['readConfiguration'], refused: [] })
    expect(useClientZustand.getState().sessions[client]?.readConfiguration).toBe(true)
    expect(calls.map((call) => call.method)).toEqual(['setRegisterMapping', 'setReadConfiguration'])
    expect(useLiveZustand.getState().clients[client]?.registerData).toHaveLength(1)
  })

  it('refuses read configuration over a mapping with nothing to read', async () => {
    useClientZustand.getState().setRegisterMapping(0, 'comment', 'a note')
    const answer = await run('set_client_config', { client, readConfiguration: true })
    expect(answer).toEqual({ changed: [], refused: ['readConfiguration'] })
    expect(useClientZustand.getState().sessions[client]?.readConfiguration).toBe(false)
  })

  it('refuses read configuration during a scan, and takes it during a poll', async () => {
    mapOneRegister()
    setState({ connectState: 'connected', scanningRegisters: true })
    expect(await run('set_client_config', { client, readConfiguration: true })).toEqual({
      changed: [],
      refused: ['readConfiguration']
    })

    setState({ connectState: 'connected', polling: true })
    expect(await run('set_client_config', { client, readConfiguration: true })).toEqual({
      changed: ['readConfiguration'],
      refused: []
    })
  })

  it('refuses a com port that is blank, as the field does', async () => {
    const answer = await run('set_client_config', { client, com: '' })
    expect(answer).toEqual({ changed: [], refused: ['com'] })
  })

  it('refuses every field while the session is still loading', async () => {
    useClientZustand.setState((state) => {
      const session = state.sessions[client]
      if (session) session.ready = false
    })

    const answer = await run('set_client_config', { client, length: 5, readConfiguration: true })

    expect(answer).toEqual({ changed: [], refused: ['length', 'readConfiguration'] })
  })

  it('sets the fields on the client it names when the selection moves meanwhile', async () => {
    const other = useClientZustand.getState().addClient()
    const answer = run('set_client_config', { client, port: 1504, length: 7 })
    useClientZustand.getState().setSelectedUuid(other)
    await answer

    expect(useClientZustand.getState().clients[client]?.registerConfig.length).toBe(7)
    expect(useClientZustand.getState().clients[other]?.registerConfig.length).not.toBe(7)
  })

  it('refuses a client it cannot put on screen while another call holds the selection', async () => {
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(client)
    await holdSelection(async () => {
      await expect(run('set_client_config', { client: other, length: 5 })).rejects.toThrow('busy')
    })
    expect(useClientZustand.getState().clients[other]?.registerConfig.length).not.toBe(5)
  })

  it('refuses a client id nobody has', async () => {
    await expect(run('set_client_config', { client: 'nobody', port: 1 })).rejects.toThrow(
      'list_clients'
    )
  })
})

describe('connect and disconnect', () => {
  it('connects a disconnected client, and answers the state main reached', async () => {
    expect(await run('connect', { client })).toEqual({ connectState: 'connected' })
    expect(sent('connect')).toEqual([client])
  })

  it('refuses to connect a client that is connected', async () => {
    setState({ connectState: 'connected' })
    await expect(run('connect', { client })).rejects.toThrow('connected already')
    expect(sent('connect')).toEqual([])
  })

  it('refuses to connect a client that is still connecting', async () => {
    setState({ connectState: 'connecting' })
    await expect(run('connect', { client })).rejects.toThrow('connecting already')
    expect(sent('connect')).toEqual([])
  })

  it('refuses to connect a unit id past what the protocol takes', async () => {
    await run('set_client_config', { client, unitId: 250, com: 'COM1' })
    await run('set_client_config', { client, protocol: 'ModbusRtu' })
    await expect(run('connect', { client })).rejects.toThrow('stops at 247')
    expect(sent('connect')).toEqual([])
    await run('set_client_config', { client, protocol: 'ModbusTcp', unitId: 1 })
  })

  it('holds off a serial connect while the serial group dialog is up', async () => {
    const { check } = useSerialGroupZustand.getState()
    useSerialGroupZustand.setState({ check: () => Promise.resolve(true) })
    await run('set_client_config', { client, protocol: 'ModbusRtu', com: 'COM1' })
    try {
      await expect(run('connect', { client })).rejects.toThrow('cannot open serial ports')
      expect(sent('connect')).toEqual([])
    } finally {
      useSerialGroupZustand.setState({ check })
      await run('set_client_config', { client, protocol: 'ModbusTcp' })
    }
  })

  it('refuses to connect a client that names no host', async () => {
    // What the field leaves when it is emptied.
    await useClientZustand.getState().setHost('', false)
    await expect(run('connect', { client })).rejects.toThrow('names no host')
    await useClientZustand.getState().setHost('127.0.0.1', true)
  })

  it('disconnects a connected client', async () => {
    setState({ connectState: 'connected' })
    expect(await run('disconnect', { client })).toEqual({ connectState: 'disconnected' })
    expect(sent('disconnect')).toEqual([client])
  })

  it('empties the grid of a toolbar read on disconnect', async () => {
    setState({ connectState: 'connected' })
    useLiveZustand.getState().setRegisterData(client, [{ id: 0 }] as never)
    await run('disconnect', { client })
    expect(useLiveZustand.getState().clients[client]?.registerData).toEqual([])
  })

  it('keeps the grid of a mapping on disconnect', async () => {
    setState({ connectState: 'connected' })
    mapOneRegister()
    await run('set_client_config', { client, readConfiguration: true })
    await run('disconnect', { client })
    expect(useLiveZustand.getState().clients[client]?.registerData).toHaveLength(1)
  })

  it('refuses to disconnect a client that is not connected', async () => {
    await expect(run('disconnect', { client })).rejects.toThrow('not connected')
  })
})

describe('read and poll', () => {
  it('reads a connected client and answers what read_values would', async () => {
    setState({ connectState: 'connected' })
    const answer = await run('read', { client })
    expect(sent('read')).toEqual([client])
    expect(answer).toMatchObject({ rows: [{ address: 0, hex: '002a' }] })
  })

  it('answers what the store holds once the timeout passes with no word from main', async () => {
    vi.useFakeTimers()
    eventsAfter.delete('read')
    setState({ connectState: 'connected' })
    let answer: unknown
    void run('read', { client }).then((result) => (answer = result))

    await vi.advanceTimersByTimeAsync(5000)
    expect(answer).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(answer).toMatchObject({ rows: [] })
  })

  it('refuses a read while the client polls, as the Read button greys', async () => {
    setState({ connectState: 'connected', polling: true })
    await expect(run('read', { client })).rejects.toThrow('Cannot read during a poll')
    expect(sent('read')).toEqual([])
  })

  it('refuses a read of a client that is not connected', async () => {
    await expect(run('read', { client })).rejects.toThrow('connect it first')
  })

  it('refuses a read of no registers', async () => {
    setState({ connectState: 'connected' })
    // What the field leaves when it is emptied.
    await useClientZustand.getState().setLength('', false)
    await expect(run('read', { client })).rejects.toThrow('reads no registers')
    expect(sent('read')).toEqual([])
  })

  it('starts a poll, and refuses a second', async () => {
    setState({ connectState: 'connected' })
    expect(await run('start_polling', { client })).toEqual({ polling: true })
    expect(sent('startPolling')).toEqual([client])

    setState({ connectState: 'connected', polling: true })
    await expect(run('start_polling', { client })).rejects.toThrow('polling already')
  })

  it('refuses a poll during a read, and of a client that is not connected', async () => {
    setState({ connectState: 'connected', reading: true })
    await expect(run('start_polling', { client })).rejects.toThrow(
      'Cannot poll during another read'
    )

    setState({})
    await expect(run('start_polling', { client })).rejects.toThrow('connect it first')
    expect(sent('startPolling')).toEqual([])
  })

  it('stops a poll, and refuses to stop none', async () => {
    setState({ connectState: 'connected', polling: true })
    expect(await run('stop_polling', { client })).toEqual({ polling: false })
    expect(sent('stopPolling')).toEqual([client])

    setState({ connectState: 'connected' })
    await expect(run('stop_polling', { client })).rejects.toThrow('not polling')
  })
})
