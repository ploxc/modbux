/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BackendMessage, Protocol, RawTransaction, WriteParameters } from '@shared'
import type { Windows } from '../../windows'
import { AppState } from '../../state'

// Track event handlers registered on the mock ModbusRTU client
let clientEventHandlers: Record<string, (...args: unknown[]) => void> = {}

/**
 * Fire what the client registered, or fail naming the handler that is missing.
 *
 * Reaching through the record with `?.()` would turn a client that registered
 * nothing into a test that quietly does nothing and still passes.
 */
const fireClientEvent = (event: 'close' | 'error', ...args: unknown[]): void => {
  const handler = clientEventHandlers[event]
  if (!handler) throw new Error(`no '${event}' handler registered`)
  // modbus-serial's ports set `openFlag` false before they emit a close, so
  // the client reads shut by the time the close reaches it.
  if (event === 'close') mockModbusRTU.isOpen = false
  handler(...args)
}

type ConnectName = 'connectTCP' | 'connectTelnet' | 'connectRTUBuffered'

/** What each connect was handed, copied before the library wrote into it. */
let handedOver: Partial<Record<ConnectName, { target: string; options: unknown }>> = {}

/**
 * Keep a copy of the options a connect was handed, then write into them the way
 * the library does.
 *
 * `apis/connection.js` assigns into the caller's own object before it
 * constructs the port: `connectTCP` and `connectTelnet` write
 * `options.timeout`, and `connectRTUBuffered` writes `options.platformOptions`
 * while the `RTUBufferedPort` constructor writes `options.autoOpen`. A mock
 * that writes nothing lets a caller hand over its own state unseen.
 *
 * The copy is what the shape assertions read, because a recorded argument is a
 * reference and carries those writes by the time they run.
 */
const recordConnect = (
  name: ConnectName,
  target: string,
  options: Record<string, unknown>,
  writes: Record<string, unknown>
): void => {
  handedOver[name] = { target, options: { ...options } }
  Object.assign(options, writes)
}

/**
 * A `ModbusRTU`, with the handlers registered on this one kept beside it.
 *
 * `clientEventHandlers` holds what the newest client registered, which is what
 * every test firing an event on the live connection wants. A client the app
 * abandons keeps answering to its own `handlers`, and that record is the only
 * way to ask whether it still speaks.
 */
const createMockModbusRTU = () => ({
  isOpen: false,
  handlers: {} as Record<string, (...args: unknown[]) => void>,
  on: vi.fn(function (
    this: { handlers: Record<string, (...args: unknown[]) => void> },
    event: string,
    handler: (...args: unknown[]) => void
  ) {
    clientEventHandlers[event] = handler
    this.handlers[event] = handler
    return this
  }),
  removeAllListeners: vi.fn(function (this: {
    handlers: Record<string, (...args: unknown[]) => void>
  }) {
    this.handlers = {}
    clientEventHandlers = {}
  }),
  setTimeout: vi.fn(),
  setID: vi.fn(),
  connectTCP: vi.fn(async (host: string, options: Record<string, unknown>) => {
    recordConnect('connectTCP', host, options, { timeout: 3000 })
  }),
  connectRTUBuffered: vi.fn(async (path: string, options: Record<string, unknown>) => {
    recordConnect('connectRTUBuffered', path, options, {
      autoOpen: false,
      platformOptions: { vmin: 5, vtime: 0 }
    })
  }),
  connectTelnet: vi.fn(async (host: string, options: Record<string, unknown>) => {
    recordConnect('connectTelnet', host, options, { timeout: 3000 })
  }),
  close: vi.fn((cb: () => void) => cb()),
  destroy: vi.fn((cb: () => void) => cb()),
  readCoils: vi.fn().mockResolvedValue(undefined),
  readDiscreteInputs: vi.fn().mockResolvedValue(undefined),
  readInputRegisters: vi.fn().mockResolvedValue(undefined),
  readHoldingRegisters: vi.fn().mockResolvedValue(undefined),
  writeFC5: vi.fn(),
  writeFC6: vi.fn(),
  writeFC15: vi.fn(),
  writeFC16: vi.fn(),
  _transactions: {} as Record<string, unknown>,
  // The port modbus-serial files transactions against. `open` sets this to 1
  // on every transport; only a TCP or UDP port increments it, which is what
  // `serialPort()` below switches off.
  _port: { _transactionIdWrite: 1 },
  isDebugEnabled: false
})

let mockModbusRTU = createMockModbusRTU()

/** Every client constructed since the last `beforeEach`, oldest first. */
let modbusInstances: Array<ReturnType<typeof createMockModbusRTU>> = []

vi.mock('modbus-serial', () => {
  // Must use `function` (not arrow) so it can be called with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCtor: any = vi.fn().mockImplementation(function () {
    // The one a test set up, because a transport constructs its `ModbusRTU`
    // on the first connect, after the test configured it. A test that wants a
    // transport after that one to get a fresh object assigns one first.
    if (!modbusInstances.includes(mockModbusRTU)) modbusInstances.push(mockModbusRTU)
    return mockModbusRTU
  })
  MockCtor.getPorts = vi.fn().mockResolvedValue([])
  return { default: MockCtor }
})

import { ModbusClient } from '../modbusClient'
import { Transports } from '../modbusClient/transports'
import * as serialPorts from '../modbusClient/serialPorts'
import ModbusRTU from 'modbus-serial'

/** Answer the oldest request still waiting, or fail naming that none is. */
const answerNext = (answers: Array<() => void>): void => {
  const answer = answers.shift()
  if (!answer) throw new Error('no request is waiting for an answer')
  answer()
}

/** When a mock was first called, or a failure naming the one that never ran. */
const firstCallOrder = (
  mock: { mock: { invocationCallOrder: number[] } },
  name: string
): number => {
  const [order] = mock.mock.invocationCallOrder
  if (order === undefined) throw new Error(`${name} was never called`)
  return order
}

/**
 * What the renderer would have received, in the order it would have received it.
 *
 * Electron structured-clones a payload on its way to a window, so the mock does
 * too. Keeping the argument keeps a live reference, and `_sendClientState` sends
 * `this._clientState` itself, so an assertion on an earlier send would read that
 * state as it is now rather than as it was.
 */
let sentToWindows: any[][] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let addressedTo: any[][] = []
/** The uuid each client event named, beside the event. */
let namedClient: Array<[string, unknown]> = []

/** The field each client event carries its payload in, beside the uuid. */
const CLIENT_EVENT_FIELDS: Record<string, string> = {
  client_state: 'clientState',
  register_data: 'registerData',
  address_groups: 'addressGroups',
  transaction: 'transaction',
  scan_unit_id_result: 'result',
  scan_progress: 'progress'
}

const createMockWindows = (): Windows =>
  ({
    // The addressee is recorded apart from the payload, because who a message
    // reached is its own question. `undefined` there is every window. A client
    // event's payload is recorded without its uuid, which `namedClient` keeps.
    send: vi.fn((event: string, payload: unknown, to?: unknown) => {
      const field = CLIENT_EVENT_FIELDS[event]
      const addressed = payload as Record<string, unknown>
      if (field) namedClient.push([event, addressed['uuid']])
      sentToWindows.push([event, structuredClone(field ? addressed[field] : payload)])
      addressedTo.push([to, event])
    })
  }) as unknown as Windows

describe('ModbusClient', () => {
  let client: ModbusClient
  let windows: Windows
  let appState: AppState
  let transports: Transports

  beforeEach(() => {
    vi.useFakeTimers()
    clientEventHandlers = {}
    modbusInstances = []
    handedOver = {}
    mockModbusRTU = createMockModbusRTU()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ModbusRTU as any).getPorts.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ModbusRTU as any).getPorts.mockResolvedValue([])
    sentToWindows = []
    addressedTo = []
    namedClient = []
    portIncrementsKey = true
    windows = createMockWindows()
    appState = new AppState()
    transports = new Transports(windows)
    client = new ModbusClient({ uuid: 'client-1', appState, windows, transports })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** Connect over TCP and leave the port open, which `isOpen` is read for. */
  const connectClient = async () => {
    mockModbusRTU.connectTCP.mockImplementation(
      async (host: string, options: Record<string, unknown>) => {
        recordConnect('connectTCP', host, options, { timeout: 3000 })
        mockModbusRTU.isOpen = true
      }
    )
    await client.connect()
  }

  const getWindowCalls = (event: string) => sentToWindows.filter((call) => call[0] === event)

  /**
   * The nth client the app constructed, or a failure naming the one that was
   * never built. Index 0 is the client `ModbusClient`'s constructor takes, and
   * index 1 the one the disconnect timeout puts in its place.
   */
  const constructedClient = (index: number) => {
    const instance = modbusInstances[index]
    if (!instance) throw new Error(`no client was constructed at index ${index}`)
    return instance
  }

  /** Fire an event on one client, or fail naming the handler it does not have. */
  const fireOn = (
    client: ReturnType<typeof createMockModbusRTU>,
    event: 'close' | 'error',
    ...args: unknown[]
  ): void => {
    const handler = client.handlers[event]
    if (!handler) throw new Error(`that client has no '${event}' handler`)
    handler(...args)
  }

  const getLastClientState = () => {
    const calls = getWindowCalls('client_state')
    return calls.at(-1)?.[1]
  }

  // Helper: create a mock transaction for _logTransaction
  const createMockTransaction = (address = 0, length = 10) => ({
    nextAddress: 1,
    nextDataAddress: address,
    nextCode: 3,
    nextLength: length,
    _timeoutFired: false,
    request: Buffer.from([0x01, 0x03, 0x00, address, 0x00, length]),
    responses: [Buffer.from([0x01, 0x03, length * 2, 0x00, 0x64])]
  })

  /** False once a test asks for a serial port, which does not move the key. */
  let portIncrementsKey = true

  /**
   * Make the port a serial one, which is only ever the key standing still.
   *
   * `open` sets `_transactionIdWrite` to 1 for every transport, so the mock
   * starts where a serial port stays. Only `tcpport.js`,
   * `tcprtubufferedport.js` and `udpport.js` go on to increment it, and
   * `rtubufferedport.js` never names the field.
   */
  const serialPort = (): void => {
    portIncrementsKey = false
  }

  /**
   * File a transaction the way modbus-serial does.
   *
   * `writeFCx` files under the port's current write id and the port increments
   * it once the buffer is out, so a request filed here takes the key the client
   * read before the call.
   */
  const fileTransaction = (transaction: RawTransaction = createMockTransaction()): string => {
    const key = String(mockModbusRTU._port._transactionIdWrite)
    mockModbusRTU._transactions = { ...mockModbusRTU._transactions, [key]: transaction }
    if (portIncrementsKey) mockModbusRTU._port._transactionIdWrite += 1
    return key
  }

  // Helper: setup read mocks that return valid data and populate _transactions
  const setupHoldingRegisterReadMock = (data: number[] = [100]) => {
    const buf = Buffer.alloc(data.length * 2)
    data.forEach((v, i) => buf.writeUInt16BE(v, i * 2))
    mockModbusRTU.readHoldingRegisters.mockImplementation(
      async (address: number, length: number) => {
        fileTransaction(createMockTransaction(address, length))
        return { data, buffer: buf }
      }
    )
  }

  /**
   * Hold every holding-register read open until the test lets it answer.
   *
   * A poll chain is only observable while its read is in flight: that is where
   * a second `startPolling` finds it and where `stopPolling` leaves it holding
   * no timer handle.
   */
  const gateTheReads = () => {
    const gates: Array<() => void> = []
    mockModbusRTU.readHoldingRegisters.mockImplementation(
      () =>
        new Promise((resolve) => {
          gates.push(() => resolve({ data: [100], buffer: Buffer.from([0x00, 0x64]) }))
        })
    )
    return {
      /**
       * Answer every read on the wire. A read waits its turn on the
       * transport's queue first, so the microtasks run before the gates are
       * counted.
       */
      resolveAll: async (): Promise<void> => {
        await vi.advanceTimersByTimeAsync(0)
        gates.forEach((gate) => gate())
      }
    }
  }

  describe('initial state', () => {
    it('starts in disconnected state', () => {
      expect(client.state.connectState).toBe('disconnected')
      expect(client.state.polling).toBe(false)
      expect(client.state.scanningUnitIds).toBe(false)
      expect(client.state.scanningRegisters).toBe(false)
    })
  })

  describe('connect', () => {
    it('transitions to connecting then connected on TCP success', async () => {
      await connectClient()

      expect(handedOver.connectTCP).toEqual({
        target: '192.168.1.10',
        options: { port: 502 }
      })

      expect(getLastClientState().connectState).toBe('connected')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'success')).toBe(true)
    })

    // The client view never leaves the main window, so broadcasting put a
    // connection error in the server window too while the two were split.
    it('sends its messages to the main window', async () => {
      mockModbusRTU.connectTCP.mockRejectedValue(new Error('Connection refused'))

      await client.connect()

      const to = addressedTo.filter(([, event]) => event === 'backend_message').map(([t]) => t)
      expect(to.length).toBeGreaterThan(0)
      expect(new Set(to)).toEqual(new Set(['main']))
    })

    it('transitions to disconnected on connection failure', async () => {
      mockModbusRTU.connectTCP.mockRejectedValue(new Error('Connection refused'))

      await client.connect()

      expect(getLastClientState().connectState).toBe('disconnected')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
    })

    it('uses RTU when protocol is ModbusRtu', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })

      await client.connect()

      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalled()
      expect(mockModbusRTU.connectTCP).not.toHaveBeenCalled()
    })

    it('uses encapsulated RTU over TCP (raw RTU frames via connectTelnet) when protocol is ModbusRtuOverTcp', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtuOverTcp' })

      await client.connect()

      // connectTelnet sends the RTU frame (with CRC) unchanged over TCP.
      // connectTCP / connectTcpRTUBuffered would speak MBAP (plain Modbus TCP).
      expect(handedOver.connectTelnet).toEqual({
        target: '192.168.1.10',
        options: { port: 502 }
      })
      expect(mockModbusRTU.connectTCP).not.toHaveBeenCalled()
      expect(mockModbusRTU.connectRTUBuffered).not.toHaveBeenCalled()
    })

    it('keeps the tcp options it read out of the connect it made', async () => {
      await connectClient()

      expect(appState.connectionConfig.tcp.options).toEqual({ port: 502 })
    })

    it('keeps the serial options it read out of the connect it made', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })

      await client.connect()

      expect(appState.connectionConfig.rtu.options).toEqual({
        baudRate: '9600',
        dataBits: 8,
        stopBits: 1,
        parity: 'none'
      })
    })

    /**
     * A connect the user cancelled while the port was still opening.
     *
     * The open resolves after `disconnect` has run, which is the whole case:
     * on a socat pty the app reported "Connected over Modbus RTU" and left the
     * button on Disconnect.
     */
    const cancelDuringOpen = async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })
      let finishOpen = (): void => {}
      mockModbusRTU.connectRTUBuffered.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishOpen = (): void => {
              mockModbusRTU.isOpen = true
              resolve()
            }
          })
      )

      const connecting = client.connect()
      await client.disconnect()
      finishOpen()
      await connecting
    }

    it('reports nothing for a connect that was cancelled while opening', async () => {
      await cancelDuringOpen()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('Connected over'))).toBe(false)
      expect(getLastClientState().connectState).toBe('disconnected')
    })

    it('closes the port a cancelled connect opened', async () => {
      await cancelDuringOpen()

      expect(mockModbusRTU.close).toHaveBeenCalled()
    })

    /**
     * Connect, Cancel, Connect, with the first open still in flight.
     *
     * The cancel sets 'disconnected' as it returns, so the button is a live
     * Connect again while the first port is still opening. `ModbusRTU` holds
     * one port at a time, so a second attempt would put its port in the slot
     * the first one is about to close.
     */
    it('refuses a connect while an earlier one is still opening', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })
      let finishOpen = (): void => {}
      mockModbusRTU.connectRTUBuffered.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishOpen = (): void => {
              mockModbusRTU.isOpen = true
              resolve()
            }
          })
      )

      const connecting = client.connect()
      await client.disconnect()
      await client.connect()

      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalledTimes(1)

      finishOpen()
      await connecting

      expect(getLastClientState().connectState).toBe('disconnected')
    })

    /**
     * The refusal has to hold until the port is let go, not until the close is
     * asked for. The next connect opens the same path, and a serial port that
     * is still closing refuses that open.
     */
    it('refuses a connect until the cancelled one has released its port', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })
      let finishOpen = (): void => {}
      mockModbusRTU.connectRTUBuffered.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finishOpen = (): void => {
              mockModbusRTU.isOpen = true
              resolve()
            }
          })
      )
      let finishClose = (): void => {}
      mockModbusRTU.close.mockImplementation((callback: () => void) => {
        // `SerialPort.isOpen` is `(port?.isOpen ?? false) && !this.closing` and
        // `close()` sets `closing` before it does anything, so the port reads
        // shut from the call rather than from the callback. That is why the
        // `isOpen` guard in `connect` does not cover this window.
        mockModbusRTU.isOpen = false
        finishClose = (): void => callback()
      })

      const connecting = client.connect()
      await client.disconnect()
      finishOpen()
      await vi.advanceTimersByTimeAsync(0)

      await client.connect()
      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalledTimes(1)

      finishClose()
      await connecting

      const retry = client.connect()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalledTimes(2)
      finishOpen()
      await retry
    })

    // An `error` that no close follows says so and changes nothing: the port
    // may well be working.
    it('keeps a port an error left working', async () => {
      await connectClient()
      fireClientEvent('error', new Error('the port faulted'))
      expect(client.state.connectState).toBe('connected')

      setupHoldingRegisterReadMock([100])
      await client.read()
      expect(getWindowCalls('register_data')).toHaveLength(1)
    })

    // Main does not refuse a connection field while connected, so a connect
    // can arrive for another connection while this one stands.
    it('keeps the connection it has when asked for another while connected', async () => {
      await connectClient()
      appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
      mockModbusRTU = createMockModbusRTU()

      await client.connect()

      expect(constructedClient(0).close).not.toHaveBeenCalled()
      expect(modbusInstances).toHaveLength(1)
      expect(getLastClientState().connectState).toBe('connected')
      expect(getWindowCalls('backend_message').at(-1)?.[1].message).toBe('Already connected')
    })

    it('says it is still connecting when asked for another connection meanwhile', async () => {
      mockModbusRTU.connectTCP.mockImplementation(() => new Promise<void>(() => {}))
      void client.connect()
      await vi.advanceTimersByTimeAsync(0)
      appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })

      await client.connect()

      expect(getWindowCalls('backend_message').at(-1)?.[1].message).toBe('Still connecting')
    })

    // A close can answer seconds after the disconnect that asked for it, and
    // by then the client may ride another connection. What the late close
    // says is about the one it left.
    it('stays connected when the connection it left finishes closing', async () => {
      await connectClient()
      let closed: () => void = () => {
        throw new Error('close was never called')
      }
      mockModbusRTU.close.mockImplementation((callback: () => void) => {
        closed = callback
      })
      const disconnecting = client.disconnect()

      appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
      mockModbusRTU = createMockModbusRTU()
      await connectClient()
      expect(getLastClientState().connectState).toBe('connected')

      closed()
      await disconnecting

      expect(getLastClientState().connectState).toBe('connected')
      expect(client.state.connectState).toBe('connected')
    })

    // A connect refused while the close before it is still closing leaves the
    // client on that transport, so the close still reaches it when it answers.
    it('ends disconnected when a refused connect lands during its close', async () => {
      await connectClient()
      let closed: () => void = () => {
        throw new Error('close was never called')
      }
      constructedClient(0).close.mockImplementation((callback: () => void) => {
        closed = callback
      })

      // Another client cancels an open to 192.168.1.11, which is still opening.
      mockModbusRTU = createMockModbusRTU()
      mockModbusRTU.connectTCP.mockImplementation(() => new Promise<void>(() => {}))
      const otherState = new AppState()
      otherState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
      const other = new ModbusClient({
        uuid: 'client-2',
        appState: otherState,
        windows,
        transports
      })
      void other.connect()
      await vi.advanceTimersByTimeAsync(0)
      await other.disconnect()

      const disconnecting = client.disconnect()
      appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
      await client.connect()
      expect(getWindowCalls('backend_message').at(-1)?.[1].message).toBe(
        'Still finishing the connect you cancelled'
      )

      closed()
      await disconnecting
      expect(client.state.connectState).toBe('disconnected')
    })

    it('emits "Already connected" warning if client is open', async () => {
      await connectClient()

      await client.connect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Already connected')).toBe(true)
    })

    // The unit id belongs to a request rather than to the connection, which
    // every client riding it sets for its own requests.
    it('opens with a 3000 ms timeout and names the unit id on each request', async () => {
      appState.updateConnectionConfig({ unitId: 42 })

      await connectClient()

      expect(mockModbusRTU.setTimeout).toHaveBeenCalledWith(3000)
      expect(mockModbusRTU.setID).not.toHaveBeenCalled()

      setupHoldingRegisterReadMock([100])
      await client.read()

      expect(mockModbusRTU.setID).toHaveBeenCalledWith(42)
      expect(firstCallOrder(mockModbusRTU.setID, 'setID')).toBeLessThan(
        firstCallOrder(mockModbusRTU.readHoldingRegisters, 'readHoldingRegisters')
      )
    })

    it('humanizes serial port errors', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })
      mockModbusRTU.connectRTUBuffered.mockRejectedValue(new Error('file not found'))

      await client.connect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('not found or not available'))).toBe(true)
    })

    it('emits "Reconnected" message naming the transport', async () => {
      await connectClient()
      // Simulate connection loss — isOpen goes false
      mockModbusRTU.isOpen = false
      fireClientEvent('close')

      // The reconnect will call connect() which calls connectTCP
      // connectTCP mock still resolves and sets isOpen = true
      await vi.advanceTimersByTimeAsync(3500)

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Reconnected over Modbus TCP')).toBe(true)
    })

    it.each([
      ['ModbusTcp', 'Connected over Modbus TCP'],
      ['ModbusRtuOverTcp', 'Connected over RTU over TCP'],
      ['ModbusRtu', 'Connected over Modbus RTU']
    ])('names the transport in the connect message for %s', async (protocol, expected) => {
      appState.updateConnectionConfig({ protocol: protocol as Protocol })

      await client.connect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === expected)).toBe(true)
    })
  })

  /**
   * Both windows load the same renderer, so the split out server window holds
   * `client.zustand` too and persists it to the same key. An event delivered
   * there writes its frozen copy over what the main window stored.
   */
  describe('the client an event names', () => {
    it('names this client on every event it sends', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      await client.read()
      await client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })

      const events = new Set(namedClient.map(([event]) => event))
      expect([...events].sort()).toEqual(
        [
          'address_groups',
          'client_state',
          'register_data',
          'scan_progress',
          'scan_unit_id_result',
          'transaction'
        ].sort()
      )
      expect(namedClient.filter(([, uuid]) => uuid !== 'client-1')).toEqual([])
    })
  })

  describe('the window a client event reaches', () => {
    it('addresses every one of them to the main window', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100, 200])
      await client.read()

      const unitIdScan = client.scanUnitIds({
        range: [5, 6],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await unitIdScan

      const registerScan = client.scanRegisters({
        addressRange: [50, 69],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await registerScan

      expect(new Set(addressedTo.map(([, event]) => event))).toEqual(
        new Set([
          'backend_message',
          'client_state',
          'register_data',
          'transaction',
          'scan_unit_id_result',
          'address_groups',
          'scan_progress'
        ])
      )
      expect(new Set(addressedTo.map(([to]) => to))).toEqual(new Set(['main']))
    })
  })

  describe('disconnect', () => {
    it('transitions through disconnecting to disconnected', async () => {
      await connectClient()
      await client.disconnect()

      expect(getLastClientState().connectState).toBe('disconnected')
    })

    it('emits warning when already disconnected', async () => {
      mockModbusRTU.isOpen = false

      await client.disconnect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Already disconnected')).toBe(true)
    })

    it('stops polling on disconnect', async () => {
      await connectClient()

      client.startPolling()
      // Allow the async _poll chain to settle
      await vi.advanceTimersByTimeAsync(100)
      expect(client.state.polling).toBe(true)

      await client.disconnect()
      expect(client.state.polling).toBe(false)
    })

    it('destroys client on timeout when close hangs', async () => {
      await connectClient()
      // Make close never call its callback
      mockModbusRTU.close.mockImplementation(() => {})

      const disconnectPromise = client.disconnect()
      // Advance past the 5s disconnect timeout
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      expect(constructedClient(0).destroy).toHaveBeenCalled()
      const messages = getWindowCalls('backend_message')
      // Over TCP `destroy` does destroy the socket, so the message says so.
      expect(
        messages.some((m) => m[1].message === 'Disconnect timeout, the connection was dropped')
      ).toBe(true)
    })

    it('says a serial port may stay open when the disconnect times out', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtu' })
      mockModbusRTU.connectRTUBuffered.mockImplementation(async () => {
        mockModbusRTU.isOpen = true
      })
      await client.connect()
      mockModbusRTU.close.mockImplementation(() => {})

      const disconnectPromise = client.disconnect()
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      const messages = getWindowCalls('backend_message')
      expect(
        messages.some(
          (m) => m[1].message === 'Disconnect timeout, the port may stay open until Modbux closes'
        )
      ).toBe(true)
    })

    /**
     * A client the app stops holding keeps its port, and on a serial port it
     * keeps modbus-serial's close relay too: `RTUBufferedPort` declares no
     * `destroy`, so `ModbusRTU.destroy` only calls back. Left listening, that
     * port reports its own close as a connection lost on the connection that
     * replaced it.
     */
    it('leaves the client it abandons with a sink, and the next connect listening', async () => {
      await connectClient()
      mockModbusRTU.close.mockImplementation(() => {})

      const disconnectPromise = client.disconnect()
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      mockModbusRTU = createMockModbusRTU()
      await connectClient()

      // An `error` listener and nothing else: modbus-serial's `_onError` emits
      // on the client, `destroy` leaves that relay on a serial port, and an
      // `error` with no listener is what Node throws on.
      expect(Object.keys(constructedClient(0).handlers)).toEqual(['error'])
      expect(Object.keys(constructedClient(1).handlers).sort()).toEqual(['close', 'error'])

      const before = getWindowCalls('backend_message').length
      fireOn(constructedClient(0), 'error', new Error('the port faulted'))
      expect(getWindowCalls('backend_message').length).toBe(before)
    })

    // The transport that timed out is let go of, so the next connect opens
    // another one rather than reusing the object it abandoned.
    it('connects on a fresh client after a disconnect that timed out', async () => {
      await connectClient()
      mockModbusRTU.close.mockImplementation(() => {})

      const disconnectPromise = client.disconnect()
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      mockModbusRTU = createMockModbusRTU()
      clientEventHandlers = {}
      await connectClient()

      expect(modbusInstances).toHaveLength(2)
      expect(Object.keys(clientEventHandlers).sort()).toEqual(['close', 'error'])

      // And they still do the work: a close on the new one reconnects.
      fireClientEvent('close')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('Connection lost, reconnecting'))).toBe(
        true
      )
    })

    it('leaves the handlers alone when close answers in time', async () => {
      await connectClient()

      clientEventHandlers = {}
      await client.disconnect()

      expect(Object.keys(clientEventHandlers)).toEqual([])
    })

    it('handles disconnect error', async () => {
      await connectClient()
      mockModbusRTU.close.mockImplementation(() => {
        throw new Error('close error')
      })

      await client.disconnect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
      expect(getLastClientState().connectState).toBe('disconnected')
    })

    it('skips "Already disconnected" when was in connecting state', async () => {
      await connectClient()
      // Simulate connection loss — triggers reconnect, state becomes 'connecting'
      mockModbusRTU.isOpen = false
      fireClientEvent('close')
      expect(getLastClientState().connectState).toBe('connecting')

      // Disconnect while in 'connecting' state
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()
      await client.disconnect()

      // Should NOT emit "Already disconnected" because we were connecting
      const messages = getWindowCalls('backend_message')
      expect(messages.every((m) => m[1].message !== 'Already disconnected')).toBe(true)
    })
  })

  // `modbus-serial` adds "(retry request again later)" to exception 11, and the
  // spec says the target is usually not there, which is also what Modbux's own
  // server means by it: a unit it does not host. Filed upstream as
  // yaacov/node-modbus-serial#631.
  describe('the text of exception 11', () => {
    const LIBRARY =
      'Modbus exception 11: Gateway target device failed to respond (retry request again later)'
    const SPEC =
      'Modbus exception 11: Gateway target device failed to respond (device is usually not present on the network)'

    it('reaches the message as the spec says it', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(
        Object.assign(new Error(LIBRARY), { modbusCode: 11 })
      )

      await client.read()

      const messages = getWindowCalls('backend_message').map((message) => message[1].message)
      expect(messages.some((message) => message.startsWith(SPEC))).toBe(true)
      expect(messages.some((message) => message.includes('retry request again later'))).toBe(false)
    })

    it('leaves an error with no message to say Connection error', async () => {
      await connectClient()

      fireClientEvent('error', {})

      const messages = getWindowCalls('backend_message').map((message) => message[1].message)
      expect(messages).toContain('Connection error')
    })

    it('leaves exception 6, where retrying is the point', async () => {
      await connectClient()
      const busy = 'Modbus exception 6: Slave device busy (retry request again later)'
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(
        Object.assign(new Error(busy), { modbusCode: 6 })
      )

      await client.read()

      const messages = getWindowCalls('backend_message').map((message) => message[1].message)
      expect(messages.some((message) => message.startsWith(busy))).toBe(true)
    })
  })

  describe('auto-reconnect', () => {
    const messageTexts = (): string[] =>
      getWindowCalls('backend_message').map((call) => String(call[1].message))

    it('schedules reconnect on close event', async () => {
      await connectClient()

      fireClientEvent('close')

      expect(getLastClientState().connectState).toBe('connecting')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('reconnecting'))).toBe(true)
    })

    /**
     * A poll across a reconnect.
     *
     * A client rides its transport through a reconnect, and a request that
     * finds it connecting is refused without touching the state, so the poll
     * goes on ticking and reads again once the connection is back. A stop in
     * between is the user's, and nothing undoes it.
     */
    describe('a poll across a reconnect', () => {
      const drop = (): void => {
        mockModbusRTU.isOpen = false
        fireClientEvent('close')
      }

      it('asks nothing while the reconnect runs, and reads again after it', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        client.startPolling()
        await vi.advanceTimersByTimeAsync(100)

        drop()
        mockModbusRTU.readHoldingRegisters.mockClear()
        await vi.advanceTimersByTimeAsync(2900)
        expect(client.state.connectState).toBe('connecting')
        expect(client.state.polling).toBe(true)
        expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
        expect(
          getWindowCalls('client_state').some((call) => call[1].connectState === 'disconnected')
        ).toBe(false)

        await vi.advanceTimersByTimeAsync(2000)
        expect(client.state.connectState).toBe('connected')
        expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalled()
        client.stopPolling()
      })

      it('stays stopped when it was stopped during the reconnect', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        client.startPolling()
        await vi.advanceTimersByTimeAsync(100)

        drop()
        await vi.advanceTimersByTimeAsync(1000)
        client.stopPolling()
        await vi.advanceTimersByTimeAsync(5000)

        expect(client.state.connectState).toBe('connected')
        expect(client.state.polling).toBe(false)
      })

      it('ends when the reconnect gives up', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        mockModbusRTU.connectTCP.mockRejectedValue(new Error('ECONNREFUSED'))
        client.startPolling()
        await vi.advanceTimersByTimeAsync(100)

        drop()
        await vi.advanceTimersByTimeAsync(30000)

        expect(client.state.connectState).toBe('disconnected')
        expect(client.state.polling).toBe(false)
      })
    })

    it('reconnects five times in a row, and gives up on the sixth drop', async () => {
      await connectClient()
      for (let i = 0; i < 5; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }
      expect(messageTexts().filter((text) => text === 'Reconnected over Modbus TCP')).toHaveLength(
        5
      )
      expect(getLastClientState().connectState).toBe('connected')

      const before = getWindowCalls('client_state').length
      fireClientEvent('close')
      await vi.advanceTimersByTimeAsync(3500)

      // A drop with no attempt left puts nobody on connecting.
      const states = getWindowCalls('client_state')
        .slice(before)
        .map((call) => call[1].connectState)
      expect([...new Set(states)]).toEqual(['disconnected'])

      expect(messageTexts().at(-1)).toBe(
        'Connection lost, too many consecutive reconnect attempts, giving up'
      )
      expect(getLastClientState().connectState).toBe('disconnected')
    })

    it('starts a fresh burst on a drop once the fifth reconnect has held', async () => {
      await connectClient()
      for (let i = 0; i < 5; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

      await vi.advanceTimersByTimeAsync(11000)
      fireClientEvent('close')
      await vi.advanceTimersByTimeAsync(3500)

      expect(messageTexts().at(-2)).toBe('Connection lost, reconnecting (1/5)...')
      expect(messageTexts().at(-1)).toBe('Reconnected over Modbus TCP')
      expect(getLastClientState().connectState).toBe('connected')
    })

    /**
     * A reconnect whose open fails.
     *
     * A pulled USB cable fails every open until it is plugged back in, and a
     * failed open fires no `close` to schedule the next attempt.
     */
    describe('a reconnect whose open fails', () => {
      const GONE = 'No such file or directory, cannot open /dev/tty.usbmodem144301'

      const dropWithDeviceGone = async (): Promise<void> => {
        await connectClient()
        await vi.advanceTimersByTimeAsync(11000)
        mockModbusRTU.isOpen = false
        mockModbusRTU.connectTCP.mockRejectedValue(new Error(GONE))
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

      it('tries again, and stays connecting', async () => {
        await dropWithDeviceGone()
        const attempts = mockModbusRTU.connectTCP.mock.calls.length

        await vi.advanceTimersByTimeAsync(3000)

        expect(mockModbusRTU.connectTCP.mock.calls.length).toBe(attempts + 1)
        expect(getLastClientState().connectState).toBe('connecting')
        const messages = getWindowCalls('backend_message').map((m) => m[1])
        expect(messages).toContainEqual(
          expect.objectContaining({ message: GONE, variant: 'error' })
        )
        expect(messages).toContainEqual(
          expect.objectContaining({ message: 'Reconnecting (2/5)...', variant: 'warning' })
        )
      })

      it('makes every attempt it announces', async () => {
        await dropWithDeviceGone()
        await vi.advanceTimersByTimeAsync(3000 * 5)

        const announced = messageTexts().filter((text) => /reconnecting \(/i.test(text))
        expect(announced).toEqual([
          'Connection lost, reconnecting (1/5)...',
          ...[2, 3, 4, 5].map((n) => `Reconnecting (${n}/5)...`)
        ])
        // One open for the connect, and one per attempt announced.
        expect(mockModbusRTU.connectTCP.mock.calls.length).toBe(1 + 5)
      })

      it('connects on the fifth attempt', async () => {
        await dropWithDeviceGone()
        await vi.advanceTimersByTimeAsync(3000 * 3)
        mockModbusRTU.connectTCP.mockImplementation(async () => {
          mockModbusRTU.isOpen = true
        })

        await vi.advanceTimersByTimeAsync(3000)

        expect(messageTexts().at(-1)).toBe('Reconnected over Modbus TCP')
        expect(getLastClientState().connectState).toBe('connected')
      })

      it('connects when the device is back', async () => {
        await dropWithDeviceGone()
        mockModbusRTU.connectTCP.mockImplementation(async () => {
          mockModbusRTU.isOpen = true
        })

        await vi.advanceTimersByTimeAsync(3000)

        expect(getLastClientState().connectState).toBe('connected')
        expect(messageTexts()).toContain('Reconnected over Modbus TCP')
      })

      it('gives up at the limit, and a manual connect after it starts afresh', async () => {
        await dropWithDeviceGone()
        await vi.advanceTimersByTimeAsync(3000 * 5)

        expect(messageTexts()).toContain('Too many consecutive reconnect attempts, giving up')
        expect(getLastClientState().connectState).toBe('disconnected')
        const attempts = mockModbusRTU.connectTCP.mock.calls.length
        await vi.advanceTimersByTimeAsync(10000)
        expect(mockModbusRTU.connectTCP.mock.calls.length).toBe(attempts)

        await connectClient()
        expect(getLastClientState().connectState).toBe('connected')
        expect(messageTexts().at(-1)).toBe('Connected over Modbus TCP')
      })

      it('counts on through the second the last connect was vouched for', async () => {
        await connectClient()
        mockModbusRTU.isOpen = false
        mockModbusRTU.connectTCP.mockRejectedValue(new Error(GONE))
        // The drop lands inside the ten seconds after the connect, so the
        // stability timer is still pending when the burst starts.
        await vi.advanceTimersByTimeAsync(5000)
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3000 * 6)

        const retries = messageTexts().filter((text) => text.startsWith('Reconnecting ('))
        expect(retries).toEqual([2, 3, 4, 5].map((n) => `Reconnecting (${n}/5)...`))
        expect(messageTexts()).toContain('Too many consecutive reconnect attempts, giving up')
      })

      it('leaves a connect the user pressed failing once, with no retry', async () => {
        mockModbusRTU.connectTCP.mockRejectedValue(new Error(GONE))

        await client.connect()
        await vi.advanceTimersByTimeAsync(10000)

        expect(mockModbusRTU.connectTCP.mock.calls.length).toBe(1)
        expect(getLastClientState().connectState).toBe('disconnected')
        expect(messageTexts()).toContain(GONE)
      })
    })

    it('does not reconnect after deliberate disconnect', async () => {
      await connectClient()
      await client.disconnect()

      // Clear call history to only track events after this point
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()

      fireClientEvent('close')

      // Should stay disconnected
      expect(getLastClientState().connectState).toBe('disconnected')
    })

    it('resets consecutive reconnects after successful manual connect', async () => {
      await connectClient()
      expect(getLastClientState().connectState).toBe('connected')
    })

    it('does not emit duplicate reconnecting message when timeout already exists', async () => {
      await connectClient()
      await vi.advanceTimersByTimeAsync(11000)

      // Trigger two close events quickly
      fireClientEvent('close')
      fireClientEvent('close')

      const messages = getWindowCalls('backend_message')
      const reconnectMessages = messages.filter((m) => m[1].message.includes('reconnecting'))
      // First close emits reconnecting, second should suppress it (reconnectTimeout already set)
      expect(reconnectMessages.length).toBe(1)
    })
  })

  describe('close event edge cases', () => {
    // A close that lands after the burst gave up is about a connection nobody
    // rides any more, and the user has been told it gave up.
    it('says nothing about a close after the reconnect gave up', async () => {
      await connectClient()
      // Disable auto-reconnect by exhausting reconnects
      await vi.advanceTimersByTimeAsync(11000)
      for (let i = 0; i < 6; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

      expect(client.state.connectState).toBe('disconnected')
      const before = getWindowCalls('backend_message').length
      fireClientEvent('close')

      expect(getWindowCalls('backend_message').slice(before)).toEqual([])
      expect(client.state.connectState).toBe('disconnected')
    })
  })

  describe('polling', () => {
    it('sets polling state on startPolling', async () => {
      await connectClient()

      client.startPolling()
      // Allow the async _poll chain to settle
      await vi.advanceTimersByTimeAsync(100)
      expect(client.state.polling).toBe(true)

      client.stopPolling()
    })

    it('clears polling state on stopPolling', async () => {
      await connectClient()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)
      expect(client.state.polling).toBe(true)

      client.stopPolling()
      expect(client.state.polling).toBe(false)
    })

    it('emits warning when trying to read while polling', async () => {
      await connectClient()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)

      await client.read()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot read during a poll')).toBe(true)

      client.stopPolling()
    })

    it('emits warning when trying to read during a unit id scan', async () => {
      await connectClient()
      gateTheReads()

      client.scanUnitIds({
        range: [5, 6],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(client.state.scanningUnitIds).toBe(true)

      await client.read()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot read during a unit id scan')).toBe(true)

      client.stopScanningUnitIds()
    })

    it('polls repeatedly at configured rate', async () => {
      await connectClient()
      setupHoldingRegisterReadMock()

      client.startPolling()
      // Default pollRate is 1000ms
      await vi.advanceTimersByTimeAsync(3500)

      client.stopPolling()

      // Should have polled multiple times
      expect(mockModbusRTU.readHoldingRegisters.mock.calls.length).toBeGreaterThanOrEqual(3)
    })

    it('arms no next read when polling has been stopped mid-cycle', async () => {
      await connectClient()
      const gates = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)

      // The read is in flight, so the chain holds no timer handle to clear.
      client.stopPolling()
      await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(2000)

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
    })

    it('starts no second read when startPolling is called while a read is in flight', async () => {
      await connectClient()
      gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
    })

    it('leaves one chain when a stop and a start land during a read', async () => {
      await connectClient()
      const gates = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      // The first chain cannot take its read back, so the second chain's read
      // waits behind it on the transport, and what the second start must not
      // leave behind is a second chain.
      client.stopPolling()
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)

      // The first read answers and the second goes out; that one answers and
      // the one chain left arms one next read.
      await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(2)
      await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(3)

      client.stopPolling()
    })
  })

  // A stopped poll lets go after the request it has on the wire, and what it
  // read goes nowhere.
  describe('a poll stopped during a read', () => {
    const twoGroups = (): void => {
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        }
      })
    }

    it('says nothing of a request that failed after the stop', async () => {
      await connectClient()
      let fail: () => void = () => {
        throw new Error('the read was never sent')
      }
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            fail = () => reject(new Error('Timed out'))
          })
      )

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      client.stopPolling()
      const before = getWindowCalls('backend_message').length
      fail()
      await vi.advanceTimersByTimeAsync(0)

      expect(getWindowCalls('backend_message').slice(before)).toEqual([])
    })

    it('sends nothing of the read it was in', async () => {
      await connectClient()
      const gates = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      client.stopPolling()
      await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(0)

      expect(getWindowCalls('register_data')).toEqual([])
    })

    it('sends no group after the one on the wire', async () => {
      await connectClient()
      twoGroups()
      const gates = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      client.stopPolling()
      await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockModbusRTU.readHoldingRegisters.mock.calls.map(([address]) => address)).toEqual([0])
    })

    it('leaves the queue to the chain started after it', async () => {
      await connectClient()
      twoGroups()
      const gates = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      client.stopPolling()
      client.startPolling()
      for (let answer = 0; answer < 3; answer++) await gates.resolveAll()
      await vi.advanceTimersByTimeAsync(0)

      const addresses = mockModbusRTU.readHoldingRegisters.mock.calls.map(([address]) => address)
      expect(addresses.slice(0, 3)).toEqual([0, 0, 100])
      expect(getWindowCalls('register_data')).toHaveLength(1)
      client.stopPolling()
      await gates.resolveAll()
    })

    it('gives a scan it made room for none of its rows', async () => {
      await connectClient()
      const gates = gateTheReads()
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)

      const scan = client.scanRegisters({ addressRange: [5, 5], length: 1, timeout: 1000 })
      expect(client.state.scanningRegisters).toBe(true)
      await gates.resolveAll()
      await gates.resolveAll()
      await scan

      const rows = getWindowCalls('register_data').flatMap((call) => call[1])
      expect(rows.map((row) => row.id)).toEqual([5])
    })
  })

  describe('a device that stops answering', () => {
    /** What modbus-serial rejects a request with when the device lets it run out. */
    const timedOut = (): Error =>
      Object.assign(new Error('Timed out'), {
        name: 'TransactionTimedOutError',
        errno: 'ETIMEDOUT'
      })
    const answer = { data: [1], buffer: Buffer.from([0, 1]) }
    const reads = (): number => mockModbusRTU.readHoldingRegisters.mock.calls.length
    const offlineStates = (): boolean[] =>
      getWindowCalls('client_state').map((call) => call[1].offline)

    it('is offline after three silent polls, and polled at twice the wait each time after', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(1000)
      expect(client.state.offline).toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
      expect(reads()).toBe(3)
      expect(client.state.offline).toBe(true)
      expect(offlineStates().at(-1)).toBe(true)

      await vi.advanceTimersByTimeAsync(1999)
      expect(reads()).toBe(3)
      await vi.advanceTimersByTimeAsync(1)
      expect(reads()).toBe(4)
      await vi.advanceTimersByTimeAsync(3999)
      expect(reads()).toBe(4)
      await vi.advanceTimersByTimeAsync(1)
      expect(reads()).toBe(5)

      client.stopPolling()
    })

    it('is polled no further apart than the most the config allows', async () => {
      appState.updateRegisterConfig({ maxPollInterval: 3000 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      await vi.advanceTimersByTimeAsync(2000)
      expect(reads()).toBe(4)
      await vi.advanceTimersByTimeAsync(3000)
      expect(reads()).toBe(5)
      await vi.advanceTimersByTimeAsync(3000)
      expect(reads()).toBe(6)

      client.stopPolling()
    })

    it('goes offline after as many silent polls as the config says', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 1 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)

      expect(client.state.offline).toBe(true)
      client.stopPolling()
    })

    it('is back with one answer, and polled at the poll rate again', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(client.state.offline).toBe(true)

      mockModbusRTU.readHoldingRegisters.mockResolvedValue(answer)
      await vi.advanceTimersByTimeAsync(2000)
      expect(client.state.offline).toBe(false)
      const answered = reads()
      await vi.advanceTimersByTimeAsync(1000)
      expect(reads()).toBe(answered + 1)

      client.stopPolling()
    })

    // A device that refuses a request is there to refuse it.
    it('is never offline for refusing', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(
        Object.assign(new Error('Illegal data address'), { modbusCode: 2 })
      )

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(5000)

      expect(reads()).toBe(6)
      expect(client.state.offline).toBe(false)
      client.stopPolling()
    })

    it('is read at once when the user asks, and back once it answers', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 1 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      await client.read()
      expect(client.state.offline).toBe(true)

      mockModbusRTU.readHoldingRegisters.mockResolvedValue(answer)
      await client.read()

      expect(reads()).toBe(2)
      expect(client.state.offline).toBe(false)
    })

    it('counts again from nothing for another unit id', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 2 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      await client.read()

      client.updateConnectionConfig({ unitId: 2 })
      await client.read()

      expect(client.state.offline).toBe(false)
      await client.read()
      expect(client.state.offline).toBe(true)
    })

    // A new mapping or read configuration changes what is read, not which
    // device is asked.
    it('stays offline through a change of what is read from it', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 2 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      await client.read()
      await client.read()
      expect(client.state.offline).toBe(true)

      appState.setReadConfiguration(false)
      await client.read()

      const states = offlineStates()
      expect(states.slice(states.indexOf(true))).not.toContain(false)
    })

    /** Poll until the device is offline and the next poll waits 2 s. */
    const offlineWhilePolling = async (): Promise<void> => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(2000)
      expect(reads()).toBe(3)
      expect(client.state.offline).toBe(true)
    }

    it('polls another unit id at the poll rate, and says it is not offline', async () => {
      await offlineWhilePolling()
      await vi.advanceTimersByTimeAsync(500)

      client.updateConnectionConfig({ unitId: 2 })

      expect(client.state.offline).toBe(false)
      await vi.advanceTimersByTimeAsync(499)
      expect(reads()).toBe(3)
      await vi.advanceTimersByTimeAsync(1)
      expect(reads()).toBe(4)
      client.stopPolling()
    })

    it('shortens a wait under way to a lower most', async () => {
      await offlineWhilePolling()
      await vi.advanceTimersByTimeAsync(4000)
      expect(reads()).toBe(4)
      await vi.advanceTimersByTimeAsync(1000)

      client.updateRegisterConfig({ maxPollInterval: 1000 })

      await vi.advanceTimersByTimeAsync(0)
      expect(reads()).toBe(5)
      client.stopPolling()
    })

    it('starts no second poll for a change made while a read runs', async () => {
      await connectClient()
      const answers: Array<() => void> = []
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        () => new Promise((resolve) => answers.push(() => resolve(answer)))
      )
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      answerNext(answers)
      // The second read, running on the timer the first one armed.
      await vi.advanceTimersByTimeAsync(1000)
      expect(reads()).toBe(2)

      client.updateRegisterConfig({ maxPollInterval: 2000 })
      // Every read answered as it comes, over three rounds of the poll rate:
      // one chain reads once a round, and two would read twice.
      for (let round = 0; round < 3; round++) {
        await vi.advanceTimersByTimeAsync(0)
        while (answers.length > 0) {
          answerNext(answers)
          await vi.advanceTimersByTimeAsync(0)
        }
        await vi.advanceTimersByTimeAsync(1000)
      }

      expect(reads()).toBe(5)
      client.stopPolling()
      while (answers.length > 0) answerNext(answers)
    })

    // Exception 11 is the gateway answering for a device behind it that did not.
    it('counts a gateway saying the device did not answer as silence', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 1 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(
        Object.assign(new Error('Gateway target device failed to respond'), { modbusCode: 11 })
      )

      await client.read()

      expect(client.state.offline).toBe(true)
    })

    it('holds nothing against another unit id for a read the old one left running', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 1 })
      await connectClient()
      let fail: (() => void) | undefined
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        () =>
          new Promise((_, reject) => {
            fail = () => reject(timedOut())
          })
      )
      const reading = client.read()
      await vi.advanceTimersByTimeAsync(0)

      client.updateConnectionConfig({ unitId: 2 })
      if (!fail) throw new Error('the read never went out')
      fail()
      await reading

      expect(client.state.offline).toBe(false)
    })

    // Every edit re-arms a sleeping poll, and a run of them faster than the
    // poll rate must not keep pushing it back.
    it('reads at the poll rate through a run of edits', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue(answer)
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      expect(reads()).toBe(1)

      for (let edit = 0; edit < 5; edit++) {
        await vi.advanceTimersByTimeAsync(300)
        client.updateRegisterConfig({ address: edit })
      }

      expect(reads()).toBe(2)
      client.stopPolling()
    })

    it('is not offline once disconnected', async () => {
      appState.updateRegisterConfig({ offlineAfterTimeouts: 1 })
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(timedOut())
      await client.read()
      expect(client.state.offline).toBe(true)

      await client.disconnect()

      expect(client.state.offline).toBe(false)
    })
  })

  describe('scanning', () => {
    it('stopScanningUnitIds sets flag to false', () => {
      client.stopScanningUnitIds()
      expect(client.state.scanningUnitIds).toBe(false)
    })

    it('stopScanningRegisters sets flag to false', () => {
      client.stopScanningRegisters()
      expect(client.state.scanningRegisters).toBe(false)
    })

    it('scanUnitIds stops polling and scans', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)
      expect(client.state.polling).toBe(true)

      const scanPromise = client.scanUnitIds({
        range: [5, 6],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      expect(client.state.polling).toBe(false)
      const results = getWindowCalls('scan_unit_id_result')
      expect(results.map((c) => c[1].id)).toEqual([5, 6])
    })

    it('scanRegisters stops polling and scans', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([0])

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)
      expect(client.state.polling).toBe(true)

      // The poll reads address 0 for 10 registers, so a scan that starts at 50
      // is the only thing that can have asked for these two.
      const scanPromise = client.scanRegisters({
        addressRange: [50, 69],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      expect(client.state.polling).toBe(false)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(50, 10)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(60, 10)
    })

    // The chunk is the stride, the progress divisor and the quantity of every
    // request. Clamped in one of the three, a scan asks for 125 and jumps 1000,
    // reports itself done and leaves seven eighths of the range unread.
    it('walks the range in chunks one response can carry', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'holding_registers' })
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 999],
        length: 1000,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const asked = mockModbusRTU.readHoldingRegisters.mock.calls
      expect(asked[0]).toEqual([0, 125])
      expect(asked[1]).toEqual([125, 125])
      expect(asked.length).toBe(8)
    })

    it('scanUnitIds refuses while disconnected', async () => {
      await client.scanUnitIds({
        range: [1, 3],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot scan, not connected')).toBe(true)
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
      expect(client.state.scanningUnitIds).toBe(false)
    })

    it('scanRegisters refuses while disconnected', async () => {
      await client.scanRegisters({ addressRange: [0, 99], length: 10, timeout: 1000 })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot scan, not connected')).toBe(true)
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
      expect(client.state.scanningRegisters).toBe(false)
    })

    it('scanRegisters refuses while a reconnect is in flight', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      // The port object is still open here. What says no is the connect state.
      fireClientEvent('close')
      expect(client.state.connectState).toBe('connecting')

      await client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot scan, not connected')).toBe(true)
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
    })

    it('scanRegisters reports the connection lost when the port closed underneath', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([0])
      mockModbusRTU.isOpen = false

      await client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })

      const messages = getWindowCalls('backend_message').map((m) => m[1].message)
      expect(messages.some((message) => message.startsWith('Connection lost'))).toBe(true)
      expect(messages).not.toContain('Cannot scan, not connected')
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
    })
  })

  // A TCP reset reaches the transport as nothing: `tcpport.js` emits no error
  // and no close for it. The request that finds the port shut is what says
  // the connection is lost, and the transport reconnects.
  describe('a port that closed under a connected state', () => {
    /** Connected as far as the state knows, and shut underneath. */
    const closedUnderneath = async (): Promise<void> => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.isOpen = false
    }

    const lostAndReconnecting = (): void => {
      expect(client.state.connectState).toBe('connecting')
      expect(getLastClientState().connectState).toBe('connecting')
      expect(
        getWindowCalls('backend_message').some((m) =>
          m[1].message.startsWith('Connection lost, reconnecting')
        )
      ).toBe(true)
    }

    it('a refused write reports the connection lost', async () => {
      await closedUnderneath()
      await client.write({ address: 5, type: 'coils', value: [true], single: true })
      lostAndReconnecting()
    })

    it('a refused register scan reports the connection lost', async () => {
      await closedUnderneath()
      await client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })
      lostAndReconnecting()
    })

    it('a refused unit id scan reports the connection lost', async () => {
      await closedUnderneath()
      await client.scanUnitIds({
        range: [1, 3],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      lostAndReconnecting()
    })

    // A poll asked for one read and gets one message per read otherwise.
    it('a poll waits the reconnect out without saying it cannot read', async () => {
      await closedUnderneath()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)

      lostAndReconnecting()
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot read, not connected')).toBe(false)
      expect(client.state.polling).toBe(true)
      client.stopPolling()
    })

    // `lost` says what happened, and a refusal beside it would contradict it.
    it('a read the user asked for says the connection was lost, and only that', async () => {
      await closedUnderneath()

      await client.read()

      const messages = getWindowCalls('backend_message').map((m) => m[1].message)
      expect(messages.filter((message) => message.startsWith('Connection lost'))).toHaveLength(1)
      expect(messages).not.toContain('Cannot read, not connected')
    })

    // A loop holds the transport it started on. When the client has moved on,
    // what that transport's shut port says is about the one it left.
    it('leaves the client alone when a read over the transport it left fails', async () => {
      await connectClient()
      let fail: () => void = () => {
        throw new Error('the read was never sent')
      }
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: { 0: { dataType: 'uint16' }, 100: { dataType: 'uint16' } }
      })
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            fail = () => reject(new Error('Timed out'))
          })
      )
      const reading = client.read()
      await vi.advanceTimersByTimeAsync(0)

      await client.disconnect()
      appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
      mockModbusRTU = createMockModbusRTU()
      await connectClient()

      constructedClient(0).isOpen = false
      const messagesBefore = getWindowCalls('backend_message').length
      const rowsBefore = getWindowCalls('register_data').length
      fail()
      await reading
      await vi.advanceTimersByTimeAsync(5000)

      expect(client.state.connectState).toBe('connected')
      expect(getWindowCalls('register_data')).toHaveLength(rowsBefore)
      expect(
        getWindowCalls('backend_message')
          .slice(messagesBefore)
          .some((m) => m[1].message.startsWith('Connection lost'))
      ).toBe(false)
      expect(constructedClient(0).connectTCP).toHaveBeenCalledTimes(1)
    })

    // Nothing refuses a poll started without a connection, and a chain nobody
    // ends would tick for as long as Modbux runs.
    it('ends a poll started without a connection', async () => {
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)

      expect(client.state.polling).toBe(false)
    })

    // `_settle` is the one place a request's answer is dropped when its
    // connection went, so each kind of request is asked once here.
    describe('a request whose connection went while it waited', () => {
      const shutDuring = (reader: 'readHoldingRegisters' | 'readInputRegisters'): void => {
        mockModbusRTU[reader].mockImplementation(async () => {
          mockModbusRTU.isOpen = false
          throw new Error('Port Not Open')
        })
      }

      it('gives a unit id no result when its only type found the port shut', async () => {
        await connectClient()
        shutDuring('readHoldingRegisters')

        await client.scanUnitIds({
          range: [1, 3],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers'],
          timeout: 1000
        })

        expect(getWindowCalls('scan_unit_id_result')).toEqual([])
        expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
        expect(client.state.scanningUnitIds).toBe(false)
      })

      // A stop leaves the request on the wire, and the next scan sets the
      // flag again before it settles.
      it('ends a stopped scan even when the next one has started', async () => {
        await connectClient()
        const answers: Array<() => void> = []
        mockModbusRTU.readHoldingRegisters.mockImplementation(
          () =>
            new Promise((resolve) => {
              answers.push(() => resolve({ data: [1], buffer: Buffer.from([0, 1]) }))
            })
        )
        const scan = (range: [number, number]) =>
          client.scanUnitIds({
            range,
            address: 0,
            length: 1,
            registerTypes: ['holding_registers'],
            timeout: 1000
          })
        const stopped = scan([1, 3])
        await vi.advanceTimersByTimeAsync(0)
        client.stopScanningUnitIds()
        const next = scan([10, 10])
        await vi.advanceTimersByTimeAsync(0)

        answerNext(answers)
        await stopped
        await vi.advanceTimersByTimeAsync(0)
        answerNext(answers)
        await next

        expect(getWindowCalls('scan_unit_id_result').map((call) => call[1].id)).toEqual([10])
        expect(getWindowCalls('scan_progress').map((call) => call[1])).toEqual([100])
      })

      it('sends a stopped register scan’s last chunk nowhere once the next one has started', async () => {
        await connectClient()
        const answers: Array<() => void> = []
        mockModbusRTU.readHoldingRegisters.mockImplementation(
          () =>
            new Promise((resolve) => {
              answers.push(() => resolve({ data: [1], buffer: Buffer.from([0, 1]) }))
            })
        )
        const stopped = client.scanRegisters({ addressRange: [1, 3], length: 1, timeout: 1000 })
        await vi.advanceTimersByTimeAsync(0)
        client.stopScanningRegisters()
        const next = client.scanRegisters({ addressRange: [10, 10], length: 1, timeout: 1000 })
        await vi.advanceTimersByTimeAsync(0)

        answerNext(answers)
        await stopped
        await vi.advanceTimersByTimeAsync(0)
        answerNext(answers)
        await next

        const rows = getWindowCalls('register_data').flatMap((call) => call[1])
        expect(rows.map((row) => row.id)).toEqual([10])
        expect(getWindowCalls('scan_progress').map((call) => call[1])).toEqual([100])
      })

      // A connect that finds the client connected answers "Already connected"
      // and changes nothing, so the scan running over that connection runs on.
      it('keeps a scan running through a connect that changes nothing', async () => {
        await connectClient()
        let answer: () => void = () => {
          throw new Error('the probe was never sent')
        }
        mockModbusRTU.readHoldingRegisters.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answer = () => resolve({ data: [1], buffer: Buffer.from([0, 1]) })
            })
        )
        const scanning = client.scanUnitIds({
          range: [1, 1],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers'],
          timeout: 1000
        })
        await vi.advanceTimersByTimeAsync(0)

        await client.connect()
        answer()
        await scanning

        expect(getWindowCalls('scan_unit_id_result')).toHaveLength(1)
        expect(client.state.scanningUnitIds).toBe(false)
      })

      it('sends no half grid for a read that found the port shut part way', async () => {
        await connectClient()
        appState.setReadConfiguration(true)
        appState.setRegisterMapping({
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: { 0: { dataType: 'uint16' }, 100: { dataType: 'uint16' } }
        })
        mockModbusRTU.readHoldingRegisters
          .mockResolvedValueOnce({ data: [1], buffer: Buffer.from([0, 1]) })
          .mockImplementationOnce(async () => {
            mockModbusRTU.isOpen = false
            throw new Error('Port Not Open')
          })

        await client.read()

        expect(getWindowCalls('register_data')).toEqual([])
      })

      it('says nothing of a failed read over a connection the client left', async () => {
        await connectClient()
        let fail: () => void = () => {
          throw new Error('the read was never sent')
        }
        mockModbusRTU.readHoldingRegisters.mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              fail = () => reject(new Error('Timed out'))
            })
        )
        const reading = client.read()
        await vi.advanceTimersByTimeAsync(0)
        await client.disconnect()
        appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
        mockModbusRTU = createMockModbusRTU()
        await connectClient()

        const before = getWindowCalls('backend_message').length
        fail()
        await reading

        expect(getWindowCalls('backend_message').slice(before)).toEqual([])
      })

      // The transport, the state and the port all read the same after a
      // reconnect, and the request still went out on the connection before.
      it('drops a read that went out before a reconnect', async () => {
        await connectClient()
        let fail: () => void = () => {
          throw new Error('the read was never sent')
        }
        mockModbusRTU.readHoldingRegisters.mockImplementationOnce(
          () =>
            new Promise((_resolve, reject) => {
              fail = () => reject(new Error('Timed out'))
            })
        )
        const reading = client.read()
        await vi.advanceTimersByTimeAsync(0)

        mockModbusRTU.isOpen = false
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
        expect(client.state.connectState).toBe('connected')

        const before = getWindowCalls('backend_message').length
        fail()
        await reading

        expect(getWindowCalls('backend_message').slice(before)).toEqual([])
      })

      it('says nothing of a write that failed on a connection that went', async () => {
        await connectClient()
        let fail: () => void = () => {
          throw new Error('the write was never sent')
        }
        mockModbusRTU.writeFC5.mockImplementationOnce(
          (_unit: number, _address: number, _value: boolean, next: (error: Error) => void) => {
            fail = () => next(new Error('Timed out'))
          }
        )
        const writing = client.write({ address: 5, type: 'coils', value: [true], single: true })
        await vi.advanceTimersByTimeAsync(0)

        mockModbusRTU.isOpen = false
        fireClientEvent('close')
        const before = getWindowCalls('backend_message').length
        mockModbusRTU.readCoils.mockClear()
        fail()
        await writing

        expect(getWindowCalls('backend_message').slice(before)).toEqual([])
        expect(mockModbusRTU.readCoils).not.toHaveBeenCalled()
      })

      // It landed, but the read back would ask another connection, or none.
      it('reads nothing back of a write whose connection went after it landed', async () => {
        await connectClient()
        let answer: () => void = () => {
          throw new Error('the write was never sent')
        }
        mockModbusRTU.writeFC5.mockImplementationOnce(
          (_unit: number, _address: number, _value: boolean, next: (error: null) => void) => {
            answer = () => next(null)
          }
        )
        const writing = client.write({ address: 5, type: 'coils', value: [true], single: true })
        await vi.advanceTimersByTimeAsync(0)

        fireClientEvent('close')
        mockModbusRTU.readCoils.mockClear()
        const before = getWindowCalls('backend_message').length
        answer()
        await writing

        expect(mockModbusRTU.readCoils).not.toHaveBeenCalled()
        expect(
          getWindowCalls('backend_message')
            .slice(before)
            .map((m) => m[1].message)
        ).not.toContain('Cannot read, not connected')
      })

      // Another client keeps the transport open, so leaving and joining again
      // finds the same transport, connected and open, and only the ride says
      // the old scan's request went out before.
      it('leaves a new scan alone when the old one settles after a rejoin', async () => {
        await connectClient()
        const other = new ModbusClient({
          uuid: 'client-2',
          appState: new AppState(),
          windows,
          transports
        })
        await other.connect()

        const answers: Array<() => void> = []
        mockModbusRTU.readHoldingRegisters.mockImplementation(
          () =>
            new Promise((resolve) => {
              answers.push(() => resolve({ data: [1], buffer: Buffer.from([0, 1]) }))
            })
        )
        const parameters = {
          range: [1, 1] as [number, number],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers' as const],
          timeout: 1000
        }
        const oldScan = client.scanUnitIds(parameters)
        await vi.advanceTimersByTimeAsync(0)

        await client.disconnect()
        await client.connect()
        const newScan = client.scanUnitIds(parameters)
        await vi.advanceTimersByTimeAsync(0)

        answerNext(answers)
        await oldScan
        expect(client.state.scanningUnitIds).toBe(true)
        expect(getWindowCalls('scan_unit_id_result')).toEqual([])

        await vi.advanceTimersByTimeAsync(0)
        answerNext(answers)
        await newScan
        expect(getWindowCalls('scan_unit_id_result')).toHaveLength(1)
      })

      it('sends no rows of a scan chunk over a connection the client left', async () => {
        await connectClient()
        let answer: () => void = () => {
          throw new Error('the chunk was never sent')
        }
        mockModbusRTU.readHoldingRegisters.mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              answer = () => resolve({ data: [7], buffer: Buffer.from([0, 7]) })
            })
        )
        const scanning = client.scanRegisters({ addressRange: [0, 0], length: 1, timeout: 1000 })
        await vi.advanceTimersByTimeAsync(0)
        await client.disconnect()
        appState.updateConnectionConfig({ tcp: { host: '192.168.1.11' } })
        mockModbusRTU = createMockModbusRTU()
        await connectClient()

        answer()
        await scanning

        expect(getWindowCalls('register_data')).toEqual([])
      })
    })

    it('starts one reconnect for two requests that find it shut', async () => {
      await closedUnderneath()

      await client.read()
      await client.read()

      const lost = getWindowCalls('backend_message').filter((m) =>
        m[1].message.startsWith('Connection lost, reconnecting')
      )
      expect(lost).toHaveLength(1)
    })
  })

  describe('read with data', () => {
    it('reads holding registers and sends data', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100, 200])

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBe(1)
      expect(dataCalls[0]?.[1].length).toBe(2)
    })

    it('sends address groups alongside data', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      await client.read()

      const groupCalls = getWindowCalls('address_groups')
      expect(groupCalls.length).toBe(1)
    })

    it('reads coils and sends data', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils' })
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
        return { data: [true, false, true], buffer: Buffer.from([0x05]) }
      })

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBe(1)
    })

    // A toolbar read has one group, `[address, registerConfig.length]`, so the
    // row count is that length whatever the device padded its answer to.
    it('reads the configured length of coils, not what the byte held', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils', address: 0, length: 3 })
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
        return {
          data: [true, false, true, true, true, true, true, true],
          buffer: Buffer.from([0xfd])
        }
      })

      await client.read()

      const sent = getWindowCalls('register_data')[0]?.[1]
      expect(sent.map((row: { id: number }) => row.id)).toEqual([0, 1, 2])
    })

    it('reads discrete inputs and sends data', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'discrete_inputs' })
      mockModbusRTU.readDiscreteInputs.mockImplementation(
        async (address: number, length: number) => {
          mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
          return { data: [false, true], buffer: Buffer.from([0x02]) }
        }
      )

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBe(1)
    })

    it('reads input registers and sends data', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'input_registers' })
      mockModbusRTU.readInputRegisters.mockImplementation(
        async (address: number, length: number) => {
          mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
          return { data: [500], buffer: Buffer.from([0x01, 0xf4]) }
        }
      )

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBe(1)
    })

    it('readConfiguration without backend mapping falls back to normal read', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      // readConfiguration is true but registerMapping was never synced to backend.
      // The backend should fall back to [[address, length]] instead of silently
      // producing no data.
      appState.setReadConfiguration(true)

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBe(1)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalled()
    })

    it('uses group-based reads when readConfiguration is true', async () => {
      await connectClient()
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        }
      })
      // Simple mock without _transactions to isolate the grouping logic
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [100],
        buffer: Buffer.from([0x00, 0x64])
      })

      await client.read()

      // Two groups: [0,1] and [100,1]
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(2)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(0, 1)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(100, 1)
    })

    // The toolbar's group is bounded by neither ceiling here.
    // `RegisterConfigSchema` takes a length of 65535 at any address, and the
    // type and the length travel on two channels, so main holds the old length
    // for one round trip when the type changes under it.
    it('stops the toolbar read at the last register', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'holding_registers', address: 65500, length: 125 })
      setupHoldingRegisterReadMock([100])

      await client.read()

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(65500, 36)
    })

    it('stops the toolbar read at what one response carries', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'holding_registers', address: 0, length: 2000 })
      setupHoldingRegisterReadMock([100])

      await client.read()

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(0, 125)
    })

    // A configured group is left whole. Its length is the data type's width, so
    // cutting it reads part of a value and `convertRegisterData` answers 0 to a
    // 64 bit type it has not got the registers for. Refused, the address gets
    // an error row, which is the truth about a mapping that runs off the end.
    it('leaves a configured group that runs off the end whole', async () => {
      await connectClient()
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          65534: { dataType: 'int64' }
        }
      })
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [100],
        buffer: Buffer.from([0x00, 0x64])
      })

      await client.read()

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(65534, 4)
    })

    // The pair for the group above: a data type on a coil address parses,
    // because the mapping schema is one object schema for all four types, and
    // it is the only way a bit mapping gets one.
    it('reads the toolbar window for a bit type, whatever the mapping carries', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils', address: 0, length: 10 })
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        },
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {}
      })
      mockModbusRTU.readCoils.mockResolvedValue({
        data: [true],
        buffer: Buffer.from([0x01])
      })

      await client.read()

      expect(mockModbusRTU.readCoils).toHaveBeenCalledTimes(1)
      expect(mockModbusRTU.readCoils).toHaveBeenCalledWith(0, 10)
    })

    it('handles read error and continues to next group', async () => {
      await connectClient()
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        }
      })

      let callCount = 0
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        callCount++
        if (callCount === 1) throw new Error('read timeout')
        return { data: [100], buffer: Buffer.from([0x00, 0x64]) }
      })

      await client.read()

      // In readConfiguration mode, errors go into data rows, not snackbar messages
      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBeGreaterThan(0)
      const sentData = dataCalls.at(-1)?.[1]
      const errorRow = sentData.find((d: any) => d.id === 0)
      expect(errorRow?.error).toContain('read timeout')

      // Error rows get groupIndex 0 (first group failed)
      expect(errorRow?.groupIndex).toBe(0)

      // Successful rows get groupIndex 1 (second group succeeded)
      const successRow = sentData.find((d: any) => d.id === 100)
      expect(successRow?.groupIndex).toBe(1)

      // Second group should still be read
      expect(callCount).toBe(2)
    })

    it('sets groupIndex on readConfiguration rows', async () => {
      await connectClient()
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        }
      })

      let callCount = 0
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        callCount++
        return { data: [100], buffer: Buffer.from([0x00, 0x64]) }
      })

      await client.read()

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBeGreaterThan(0)
      const sentData = dataCalls.at(-1)?.[1]
      // Two groups: [0,1] and [100,1] → groupIndex 0 and 1
      const row0 = sentData.find((d: any) => d.id === 0)
      const row100 = sentData.find((d: any) => d.id === 100)
      expect(row0?.groupIndex).toBe(0)
      expect(row100?.groupIndex).toBe(1)
      expect(callCount).toBe(2)
    })

    it('emits "not connected" warning when disconnected', async () => {
      await client.read()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('not connected'))).toBe(true)
    })
  })

  // One port, one request at a time. A poll and the two scans were the three
  // owners `_readLoopOwner` named, and a read in flight was not, so two callers
  // asking at once put two requests on one line.
  describe('a read while a read is in flight', () => {
    it('sends one request and tells the second caller what is running', async () => {
      await connectClient()
      const gate = gateTheReads()

      const first = client.read()
      await client.read()

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
      const messages = getWindowCalls('backend_message')
      expect(messages.at(-1)?.[1]).toMatchObject({
        message: 'Cannot read during another read',
        variant: 'warning'
      })

      await gate.resolveAll()
      await first
    })

    it('says a read is running while it runs, and stops saying so', async () => {
      await connectClient()
      const gate = gateTheReads()

      const first = client.read()
      expect(client.state.reading).toBe(true)
      expect(getLastClientState().reading).toBe(true)

      await gate.resolveAll()
      await first

      expect(client.state.reading).toBe(false)
      expect(getLastClientState().reading).toBe(false)
    })

    it('stops saying a read runs once a disconnect during a reconnect leaves it', async () => {
      await connectClient()
      // A read still inside its timeout, which modbus-serial rejects only once
      // that runs out: up to ten seconds, by `ReadTimingSchema`.
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        () =>
          new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Timed out')), 10000))
      )
      void client.read()
      await vi.advanceTimersByTimeAsync(0)

      fireClientEvent('close')
      await client.disconnect()
      await vi.advanceTimersByTimeAsync(0)

      expect(client.state.reading).toBe(false)
      expect(getLastClientState().reading).toBe(false)
    })

    it('reads again once the first has answered', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      await client.read()
      await client.read()

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(2)
    })

    it('refuses a write while it runs, which shares the port', async () => {
      await connectClient()
      const gate = gateTheReads()

      const first = client.read()
      await client.write({
        address: 0,
        type: 'holding_registers',
        value: 1,
        dataType: 'uint16',
        single: true
      })

      expect(mockModbusRTU.writeFC6).not.toHaveBeenCalled()
      const messages = getWindowCalls('backend_message')
      expect(messages.at(-1)?.[1]).toMatchObject({
        message: 'Cannot write during another read',
        variant: 'warning'
      })

      await gate.resolveAll()
      await first
    })
  })

  /**
   * A reply carries no unit id, no register type and no address of its own, so
   * what it describes is whatever main asked for. These hold a read open, move
   * one of those four under it, and then let it answer.
   */
  describe('a read answers for what it was addressed to', () => {
    /**
     * A gated read that files its transaction, which `gateTheReads` does not.
     * A logged transaction is what says the request went out and only its
     * answer was dropped.
     */
    const gateTheReadsFilingTransactions = () => {
      const gates: Array<() => void> = []
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        (address: number, length: number) =>
          new Promise((resolve) => {
            fileTransaction(createMockTransaction(address, length))
            gates.push(() => resolve({ data: [100], buffer: Buffer.from([0x00, 0x64]) }))
          })
      )
      return {
        resolveAll: async (): Promise<void> => {
          await vi.advanceTimersByTimeAsync(0)
          gates.forEach((gate) => gate())
        }
      }
    }
    it('drops the data when the unit id moved while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.updateConnectionConfig({ unitId: 3 })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
      expect(getWindowCalls('address_groups')).toEqual([])
    })

    it('drops the data when the register type moved while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.updateRegisterConfig({ type: 'coils' })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
    })

    it('drops the data when the address moved while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.updateRegisterConfig({ address: 40 })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
    })

    it('drops the data when the length moved while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.updateRegisterConfig({ length: 3 })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
    })

    it('drops the data when the mapping arrived while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: { 0: { dataType: 'uint16' } }
      })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
    })

    it('drops the data when read configuration was switched while it was on the wire', async () => {
      await connectClient()
      const gate = gateTheReadsFilingTransactions()

      const read = client.read()
      appState.setReadConfiguration(true)
      await gate.resolveAll()
      await read

      expect(getWindowCalls('transaction').length).toBe(1)
      expect(getWindowCalls('register_data')).toEqual([])
    })

    // The poll rate is what the next read waits, and the timeout is how long a
    // request may take. Neither changes what this read asked the device, so
    // neither may cost the user the answer.
    it('sends the data when a field the read did not ask about moved', async () => {
      await connectClient()
      const gate = gateTheReads()

      const read = client.read()
      appState.updateRegisterConfig({ pollRate: 2000, timeout: 4000 })
      await gate.resolveAll()
      await read

      expect(getWindowCalls('register_data').length).toBe(1)
    })

    // The drop is a `return` inside the read the chain is awaiting, so the
    // chain has to arm the next one anyway.
    it('polls on after the read it dropped', async () => {
      await connectClient()
      const gate = gateTheReads()

      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      appState.updateConnectionConfig({ unitId: 3 })
      await gate.resolveAll()
      await vi.advanceTimersByTimeAsync(1100)
      await gate.resolveAll()
      await vi.advanceTimersByTimeAsync(0)
      client.stopPolling()

      expect(mockModbusRTU.readHoldingRegisters.mock.calls.length).toBe(2)
      expect(getWindowCalls('register_data').length).toBe(1)
    })
  })

  describe('_logTransaction', () => {
    it('formats and sends transaction data after read', async () => {
      await connectClient()
      mockModbusRTU._port._transactionIdWrite = 42
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction({
          nextAddress: 1,
          nextDataAddress: 0,
          nextCode: 3,
          nextLength: 10,
          _timeoutFired: false,
          request: Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]),
          responses: [Buffer.from([0x01, 0x03, 0x14])]
        })
        return { data: new Array(10).fill(0), buffer: Buffer.alloc(20) }
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls.length).toBe(1)
      const tx = txCalls[0]?.[1]
      expect(tx.id).toContain('42__')
      expect(tx.unitId).toBe(1)
      expect(tx.address).toBe(0)
      expect(tx.code).toBe(3)
      expect(tx.responseLength).toBe(10)
      expect(tx.timeout).toBe(false)
      expect(tx.request).toMatch(/^[0-9A-F ]+$/)
      expect(tx.responses).toHaveLength(1)
      expect(tx.responses[0]).toMatch(/^[0-9A-F ]+$/)
      expect(tx.errorMessage).toBeUndefined()
    })

    // modbus-serial files `nextDataAddress` on two of its twelve transaction
    // records, inside `writeFC4` and `writeFC6`, and `writeFC1` delegates to
    // `writeFC2` while `writeFC3` delegates to `writeFC4`. So FC3, FC4 and FC6
    // carry one and FC1, FC2, FC5, FC15 and FC16 do not, and the Addr column
    // was blank for every coil read, every discrete input read and every write.
    // Every `writeFCx` puts the address at bytes 2 and 3 of the frame.
    it('reads the address off the request frame when the library files none', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils', address: 300, length: 4 })
      mockModbusRTU.readCoils.mockImplementation(async () => {
        fileTransaction({
          nextAddress: 1,
          nextCode: 1,
          nextLength: 6,
          _timeoutFired: false,
          // Unit id, function code, then the data address as a big-endian word.
          request: Buffer.from([0x01, 0x01, 0x01, 0x2c, 0x00, 0x04]),
          responses: [Buffer.from([0x01, 0x01, 0x01, 0x00])]
        })
        return { data: [false, false, false, false], buffer: Buffer.from([0x00]) }
      })

      await client.read()

      const tx = getWindowCalls('transaction')[0]?.[1]
      expect(tx.code).toBe(1)
      expect(tx.address).toBe(300)
    })

    // A frame that never went out has neither, and the cell is blank rather
    // than reading 0, which is an address.
    it('answers no address for a request that carries neither', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction({
          nextAddress: 1,
          nextCode: 3,
          nextLength: 10,
          _timeoutFired: false
        })
        return { data: new Array(10).fill(0), buffer: Buffer.alloc(20) }
      })

      await client.read()

      expect(getWindowCalls('transaction')[0]?.[1].address).toBeUndefined()
    })

    it('removes the transaction it logged', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([0])

      await client.read()

      expect(Object.keys(mockModbusRTU._transactions)).toEqual([])
    })

    it('logs a transaction once', async () => {
      await connectClient()
      let callCount = 0
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        callCount++
        // Only the first read leaves a transaction behind, so a second call
        // that logged the same one again would show up as two.
        if (callCount === 1) fileTransaction()
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()
      await client.read()

      expect(getWindowCalls('transaction')).toHaveLength(1)
    })

    it('leaves a transaction it did not log alone', async () => {
      await connectClient()
      // Key 1 is a request still in flight, key 2 the one this read finishes.
      // modbus-serial drops a response whose entry is gone, so taking 1 out
      // with 2 times that request out instead of answering it.
      fileTransaction(createMockTransaction(50))
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction(createMockTransaction(0))
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()

      expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      expect(getWindowCalls('transaction')).toHaveLength(1)
      expect(getWindowCalls('transaction')[0]?.[1].id).toContain('2__')
    })

    it('skips when no transactions exist', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        mockModbusRTU._transactions = {}
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls.length).toBe(0)
    })

    it('includes error message in transaction on read failure', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction()
        throw new Error('Timed out')
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls.length).toBe(1)
      expect(txCalls[0]?.[1].errorMessage).toBe('Timed out')
    })

    it('logs a transaction that carries no request or responses', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        // What modbus-serial leaves behind when the write never stashed a
        // copy: the bookkeeping fields, and nothing else.
        fileTransaction({
          nextAddress: 1,
          nextDataAddress: 0,
          nextCode: 3,
          nextLength: 10,
          _timeoutFired: false
        })
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls.length).toBe(1)
      expect(txCalls[0]?.[1].request).toBe('')
      expect(txCalls[0]?.[1].responses).toEqual([])
    })

    it('logs two serial reads under the one key that never moves', async () => {
      await connectClient()
      serialPort()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction()
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()
      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls.map((call) => call[1].id.split('__')[0])).toEqual(['1', '1'])
    })

    // The two below discriminate a per-group error message from one that
    // outlives its group: the second group answers, and the question is which
    // error the transaction it produced is logged with.
    const readTwoGroups = async (failFirst: boolean) => {
      await connectClient()
      appState.setReadConfiguration(true)
      appState.setRegisterMapping({
        coils: {},
        discrete_inputs: {},
        input_registers: {},
        holding_registers: {
          0: { dataType: 'uint16' },
          100: { dataType: 'uint16' }
        }
      })

      let callCount = 0
      mockModbusRTU.readHoldingRegisters.mockImplementation(async (address: number) => {
        callCount++
        fileTransaction(createMockTransaction(address))
        if (failFirst && callCount === 1) throw new Error('read timeout')
        return { data: [100], buffer: Buffer.from([0x00, 0x64]) }
      })

      await client.read()
      return getWindowCalls('transaction').map((c) => c[1])
    }

    it('logs the group that succeeds after a failed one without an error', async () => {
      const transactions = await readTwoGroups(true)

      expect(transactions).toHaveLength(2)
      expect(transactions[0].errorMessage).toBe('read timeout')
      expect(transactions[1].errorMessage).toBeUndefined()
    })

    it('logs both groups without an error when both succeed', async () => {
      const transactions = await readTwoGroups(false)

      expect(transactions).toHaveLength(2)
      expect(transactions[0].errorMessage).toBeUndefined()
      expect(transactions[1].errorMessage).toBeUndefined()
    })

    it('records timeout flag from transaction', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction({ ...createMockTransaction(), _timeoutFired: true })
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls[0]?.[1].timeout).toBe(true)
    })
  })

  describe('write', () => {
    describe('writeCoil', () => {
      it('writes single coil via FC5', async () => {
        await connectClient()
        mockModbusRTU.writeFC5.mockImplementation(
          (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => cb(null)
        )

        await client.write({ address: 5, type: 'coils', value: [true], single: true })

        expect(mockModbusRTU.writeFC5).toHaveBeenCalledWith(1, 5, true, expect.any(Function))
      })

      it('sends nothing for FC5 when the coil list is empty', async () => {
        await connectClient()

        // The schema accepts an empty list, and FC5 takes the first coil of it.
        await client.write({ address: 5, type: 'coils', value: [], single: true })

        expect(mockModbusRTU.writeFC5).not.toHaveBeenCalled()
        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'No coil value to write')).toBe(true)
      })

      it('writes multiple coils via FC15', async () => {
        await connectClient()
        mockModbusRTU.writeFC15.mockImplementation(
          (_uid: number, _addr: number, _val: boolean[], cb: (err: null) => void) => cb(null)
        )

        await client.write({
          address: 0,
          type: 'coils',
          value: [true, false, true],
          single: false
        })

        expect(mockModbusRTU.writeFC15).toHaveBeenCalledWith(
          1,
          0,
          [true, false, true],
          expect.any(Function)
        )
      })

      it('handles single coil write error via FC5', async () => {
        await connectClient()
        mockModbusRTU.writeFC5.mockImplementation(
          (_uid: number, _addr: number, _val: boolean, cb: (err: Error) => void) =>
            cb(new Error('write failed'))
        )

        await client.write({ address: 0, type: 'coils', value: [true], single: true })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'write failed')).toBe(true)
      })

      // ! Coverage-only: exercises reject branch in FC15 callback
      it('handles multi coil write error via FC15', async () => {
        await connectClient()
        mockModbusRTU.writeFC15.mockImplementation(
          (_uid: number, _addr: number, _val: boolean[], cb: (err: Error) => void) =>
            cb(new Error('FC15 failed'))
        )

        await client.write({ address: 0, type: 'coils', value: [true, false], single: false })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'FC15 failed')).toBe(true)
      })
    })

    describe('writeRegister', () => {
      it('writes single register via FC6', async () => {
        await connectClient()
        mockModbusRTU.writeFC6.mockImplementation(
          (_uid: number, _addr: number, _val: number, cb: (err: null) => void) => cb(null)
        )

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'uint16',
          single: true
        })

        expect(mockModbusRTU.writeFC6).toHaveBeenCalledWith(1, 0, 100, expect.any(Function))
      })

      it('writes multiple registers via FC16', async () => {
        await connectClient()
        mockModbusRTU.writeFC16.mockImplementation(
          (_uid: number, _addr: number, _val: number[], cb: (err: null) => void) => cb(null)
        )

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 70000,
          dataType: 'int32',
          single: false
        })

        expect(mockModbusRTU.writeFC16).toHaveBeenCalledWith(
          1,
          0,
          expect.any(Array),
          expect.any(Function)
        )
      })

      it('rejects single write for non-16-bit data types', async () => {
        await connectClient()

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 70000,
          dataType: 'int32',
          single: true
        })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message.includes('Single register only supported'))).toBe(
          true
        )
        // FC6 should not have been called
        expect(mockModbusRTU.writeFC6).not.toHaveBeenCalled()
      })

      // The dialog offers UTF-8 beside the numbers and has no string field, so
      // the value went out as one register of zero over whatever was there.
      it('refuses a write the value field cannot be encoded as', async () => {
        await connectClient()

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'utf8',
          single: false
        })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'Modbux cannot write a value as UTF-8')).toBe(
          true
        )
        expect(mockModbusRTU.writeFC16).not.toHaveBeenCalled()
      })

      it('refuses a write for an address the mapping gives no type', async () => {
        await connectClient()

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'none',
          single: false
        })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'Modbux cannot write a value as NONE')).toBe(
          true
        )
        expect(mockModbusRTU.writeFC16).not.toHaveBeenCalled()
      })

      it('handles register write error via FC16', async () => {
        await connectClient()
        mockModbusRTU.writeFC16.mockImplementation(
          (_uid: number, _addr: number, _val: number[], cb: (err: Error) => void) =>
            cb(new Error('write failed'))
        )

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'uint16',
          single: false
        })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'write failed')).toBe(true)
      })

      // ! Coverage-only: exercises reject branch in FC6 callback
      it('handles single register write error via FC6', async () => {
        await connectClient()
        mockModbusRTU.writeFC6.mockImplementation(
          (_uid: number, _addr: number, _val: number, cb: (err: Error) => void) =>
            cb(new Error('FC6 failed'))
        )

        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'uint16',
          single: true
        })

        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'FC6 failed')).toBe(true)
      })
    })

    /**
     * `setTimeout` is client state, not request state.
     *
     * `_read` calls it with `registerConfig.timeout` and both scans call it
     * with their own, and the write path called neither, so FC5, FC6, FC15 and
     * FC16 went out under whatever ran last: the scan field's floor is 100 ms
     * where the toolbar's is 1000, and a connect opens on 3000.
     *
     * Asserted against the order the write went out in rather than against the
     * last call, because a write ends on a read back and that read calls
     * `setTimeout` with the right value on its way: both tests here passed
     * with the write setting nothing at all.
     */
    describe('the timeout a write gives the device', () => {
      /**
       * The timeout the client was left on when `writeFC6` was called.
       *
       * `invocationCallOrder` is one counter across every mock of a run, so the
       * `setTimeout` calls before the write are the ones that decided what it
       * went out under, and the last of those is the one in force.
       */
      const timeoutWhenWritten = (): unknown => {
        const [writeOrder] = mockModbusRTU.writeFC6.mock.invocationCallOrder
        if (writeOrder === undefined) throw new Error('writeFC6 was never called')

        const calls: unknown[] = mockModbusRTU.setTimeout.mock.calls.map(
          (call: unknown[]) => call[0]
        )
        const order: number[] = mockModbusRTU.setTimeout.mock.invocationCallOrder
        return calls.filter((_, index) => (order[index] ?? 0) < writeOrder).at(-1)
      }

      const writeOne = async (): Promise<void> => {
        mockModbusRTU.writeFC6.mockImplementation(
          (_uid: number, _addr: number, _val: number, cb: (err: null) => void) => cb(null)
        )
        await client.write({
          address: 0,
          type: 'holding_registers',
          value: 1,
          dataType: 'uint16',
          single: true
        })
      }

      it('is the register config timeout after a scan set its own', async () => {
        await connectClient()
        mockModbusRTU.readHoldingRegisters.mockResolvedValue({
          data: [0],
          buffer: Buffer.alloc(2)
        })

        const scan = client.scanRegisters({ addressRange: [0, 1], length: 1, timeout: 100 })
        await vi.advanceTimersByTimeAsync(1000)
        await scan
        expect(mockModbusRTU.setTimeout).toHaveBeenLastCalledWith(100)

        await writeOne()

        expect(timeoutWhenWritten()).toBe(appState.registerConfig.timeout)
      })

      // `_connect` opens on 3000, which is the state a write arriving before
      // any read finds.
      it('is the register config timeout on the first write after a connect', async () => {
        await connectClient()
        expect(mockModbusRTU.setTimeout).toHaveBeenLastCalledWith(3000)

        await writeOne()

        expect(timeoutWhenWritten()).toBe(appState.registerConfig.timeout)
      })
    })

    // What `_logTransaction` takes is the last entry in `_transactions`, and it
    // deletes the entry it logs. So a write that files no transaction of its
    // own logs somebody else's and takes it out of the table, and `_onReceive`
    // drops a response whose entry is gone.
    describe('the transaction a write logs', () => {
      let gatedReads: ReturnType<typeof gateTheReads> | undefined
      let writeInFlight: Promise<void> | undefined

      /**
       * A read in flight, which is the entry the table holds when a write
       * arrives. The read is gated so it stays in flight for the whole test:
       * the read after a write would otherwise answer and log an entry of its
       * own.
       */
      const aReadInFlight = () => {
        gatedReads = gateTheReads()
        fileTransaction()
      }

      /**
       * A write, run up to the read back it ends on.
       *
       * `write` awaits that read back and holds the client until it answers,
       * and the gate above is what it would answer through, so the write is
       * still running when this returns. What the write logs it has logged by
       * then. `afterEach` lets the read answer and waits for the write.
       */
      const writeUpToTheReadBack = async (parameters: WriteParameters): Promise<void> => {
        writeInFlight = client.write(parameters)
        await vi.advanceTimersByTimeAsync(0)
      }

      afterEach(async () => {
        await gatedReads?.resolveAll()
        await writeInFlight
        gatedReads = undefined
        writeInFlight = undefined
      })

      it('logs nothing when the coil list is empty', async () => {
        await connectClient()
        aReadInFlight()

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [], single: true })

        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs nothing when FC15 is asked for an empty coil list', async () => {
        await connectClient()
        aReadInFlight()

        writeCoilsLikeTheLibrary(null)

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [], single: false })

        expect(mockModbusRTU.writeFC15).not.toHaveBeenCalled()
        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'No coil value to write')).toBe(true)
        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs nothing when a single register is asked for a 32 bit value', async () => {
        await connectClient()
        aReadInFlight()

        await writeUpToTheReadBack({
          address: 0,
          type: 'holding_registers',
          value: 70000,
          dataType: 'int32',
          single: true
        })

        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs nothing when the data type is one Modbux cannot write', async () => {
        await connectClient()
        aReadInFlight()

        await writeUpToTheReadBack({
          address: 0,
          type: 'holding_registers',
          value: 100,
          dataType: 'utf8',
          single: false
        })

        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      /**
       * FC5 and FC15 the way the library writes them. `index.js` answers a
       * closed port with a `PortNotOpenError` and returns, and otherwise files
       * the transaction before the buffer goes to the port, so a write that
       * reaches the port leaves one behind whether the device answers or not.
       */
      const writeCoilsLikeTheLibrary = (error: Error | null) => {
        const write = (code: number) =>
          vi.fn(
            (
              _unitId: number,
              address: number,
              _value: boolean | boolean[],
              callback: (err: Error | null) => void
            ) => {
              if (mockModbusRTU.isOpen !== true) {
                callback(new Error('Port Not Open'))
                return
              }
              fileTransaction({ ...createMockTransaction(address), nextCode: code })
              callback(error)
            }
          )
        mockModbusRTU.writeFC5.mockImplementation(write(5))
        mockModbusRTU.writeFC15.mockImplementation(write(15))
      }

      it('refuses a write while not connected', async () => {
        aReadInFlight()
        writeCoilsLikeTheLibrary(null)

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [true], single: true })

        expect(mockModbusRTU.writeFC5).not.toHaveBeenCalled()
        const messages = getWindowCalls('backend_message')
        expect(messages.at(-1)?.[1]).toMatchObject({
          message: 'Cannot write, not connected',
          variant: 'warning'
        })
        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs the transaction a write of its own filed', async () => {
        await connectClient()
        aReadInFlight()
        writeCoilsLikeTheLibrary(null)

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [true], single: true })

        const transactions = getWindowCalls('transaction')
        expect(transactions).toHaveLength(1)
        expect(transactions[0]?.[1].id).toContain('2__')
        expect(transactions[0]?.[1].code).toBe(5)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      /**
       * A poll the user starts while a write is on the wire.
       *
       * It was not refused, so both filed a transaction and the write logged
       * the entry the poll's read was still waiting on. On a serial port both
       * file under key 1, where the delete takes the only entry there is and
       * `_onReceive` drops the answer into nothing.
       *
       * The poll is refused now, so the only entry the table holds after the
       * write is the read this test put there, and the write logs its own.
       */
      it('logs its own, and the poll that would have filed a second is refused', async () => {
        await connectClient()
        aReadInFlight()
        writeCoilsLikeTheLibrary(null)

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [true], single: true })
        client.startPolling()
        await vi.advanceTimersByTimeAsync(0)

        expect(client.state.polling).toBe(false)
        const messages = getWindowCalls('backend_message').map((message) => message[1].message)
        expect(messages).toContain('Cannot poll during another write')

        const transactions = getWindowCalls('transaction')
        expect(transactions).toHaveLength(1)
        expect(transactions[0]?.[1].id).toContain('2__')
        expect(transactions[0]?.[1].code).toBe(5)
        // The read's entry, which `_onReceive` delivers its answer into.
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs the transaction of a write the device refused', async () => {
        await connectClient()
        aReadInFlight()
        writeCoilsLikeTheLibrary(new Error('Modbus exception 2: Illegal data address'))

        await writeUpToTheReadBack({ address: 5, type: 'coils', value: [true], single: true })

        const transactions = getWindowCalls('transaction')
        expect(transactions).toHaveLength(1)
        expect(transactions[0]?.[1].id).toContain('2__')
        expect(transactions[0]?.[1].errorMessage).toBe('Modbus exception 2: Illegal data address')
      })
    })

    it('refuses a write during a poll', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.writeFC5.mockImplementation(
        (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => cb(null)
      )

      client.startPolling()
      await vi.advanceTimersByTimeAsync(100)

      await client.write({ address: 0, type: 'coils', value: [true], single: true })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot write during a poll')).toBe(true)
      expect(mockModbusRTU.writeFC5).not.toHaveBeenCalled()

      client.stopPolling()
    })

    it('refuses a write during a register scan', async () => {
      await connectClient()
      gateTheReads()
      mockModbusRTU.writeFC5.mockImplementation(
        (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => cb(null)
      )

      client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(client.state.scanningRegisters).toBe(true)

      await client.write({ address: 0, type: 'coils', value: [true], single: true })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot write during a register scan')).toBe(
        true
      )
      expect(mockModbusRTU.writeFC5).not.toHaveBeenCalled()

      client.stopScanningRegisters()
    })

    /**
     * A scan the user starts while a write is on the wire.
     *
     * It took the client, so the write's read back found a loop reading and
     * skipped itself, and the scan's own requests went out under a write that
     * had not answered. The scan is refused now, so the write reads back what
     * it wrote, which is the whole point of holding the client to the end of
     * it.
     */
    it('refuses a scan started while a write is on the wire, and reads back', async () => {
      await connectClient()
      const gated = gateTheReads()
      const finishers: Array<() => void> = []
      mockModbusRTU.writeFC5.mockImplementation(
        (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => {
          finishers.push(() => cb(null))
        }
      )

      const writePromise = client.write({ address: 0, type: 'coils', value: [true], single: true })
      await vi.advanceTimersByTimeAsync(0)

      client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })
      await vi.advanceTimersByTimeAsync(0)

      expect(client.state.scanningRegisters).toBe(false)
      expect(getWindowCalls('backend_message').map((m) => m[1].message)).toContain(
        'Cannot scan during another write'
      )
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()

      const [finishWrite] = finishers
      if (!finishWrite) throw new Error('writeFC5 was never called')
      finishWrite()
      await vi.advanceTimersByTimeAsync(0)
      await gated.resolveAll()
      await writePromise

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
    })

    /**
     * Who may put a request on the wire, asked of main rather than of a
     * control.
     *
     * `read` and `write` asked; the three loops claimed the client by setting
     * their own flag and asking nobody, so a poll or a scan started during any
     * of the five put a second master on the bus. A greyed button is not the
     * guard: both windows load the same renderer and every client channel
     * reaches this class.
     *
     * A scan is the one caller that does not ask about a poll, because
     * `scanUnitIds` and `scanRegisters` stop one rather than being refused by
     * one, and that is settled before `stopPolling` so a refused scan leaves
     * the poll where it found it.
     */
    describe('a loop that finds the client taken', () => {
      /** The client in one owned state, and the state left over afterwards. */
      const whileReading = async (): Promise<void> => {
        gateTheReads()
        void client.read()
        await vi.advanceTimersByTimeAsync(0)
        expect(client.state.reading).toBe(true)
      }

      const whileScanningUnitIds = async (): Promise<void> => {
        gateTheReads()
        void client.scanUnitIds({
          range: [5, 6],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers'],
          timeout: 1000
        })
        await vi.advanceTimersByTimeAsync(0)
        expect(client.state.scanningUnitIds).toBe(true)
      }

      it('refuses a poll started during a read', async () => {
        await connectClient()
        await whileReading()

        client.startPolling()

        expect(client.state.polling).toBe(false)
        expect(getWindowCalls('backend_message').map((m) => m[1].message)).toContain(
          'Cannot poll during another read'
        )
      })

      it('refuses a poll started during a unit id scan', async () => {
        await connectClient()
        await whileScanningUnitIds()

        client.startPolling()

        expect(client.state.polling).toBe(false)
        expect(getWindowCalls('backend_message').map((m) => m[1].message)).toContain(
          'Cannot poll during a unit id scan'
        )
        client.stopScanningUnitIds()
      })

      it('refuses a register scan started during a unit id scan', async () => {
        await connectClient()
        await whileScanningUnitIds()

        await client.scanRegisters({ addressRange: [0, 1], length: 1, timeout: 1000 })

        expect(client.state.scanningRegisters).toBe(false)
        expect(getWindowCalls('backend_message').map((m) => m[1].message)).toContain(
          'Cannot scan during a unit id scan'
        )
        client.stopScanningUnitIds()
      })

      it('refuses a unit id scan started during a read', async () => {
        await connectClient()
        await whileReading()

        await client.scanUnitIds({
          range: [5, 6],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers'],
          timeout: 1000
        })

        expect(client.state.scanningUnitIds).toBe(false)
        expect(getWindowCalls('backend_message').map((m) => m[1].message)).toContain(
          'Cannot scan during another read'
        )
      })

      // The poll a scan stops, which is the one state a scan does not ask
      // about. Refusing it here would have made the scan dialog's Start button
      // unusable while polling, where today it stops the poll and runs.
      it('takes a register scan started during a poll, and stops the poll', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        client.startPolling()
        await vi.advanceTimersByTimeAsync(100)
        expect(client.state.polling).toBe(true)

        const scan = client.scanRegisters({ addressRange: [0, 1], length: 1, timeout: 1000 })
        await vi.advanceTimersByTimeAsync(1000)
        await scan

        expect(client.state.polling).toBe(false)
        expect(getWindowCalls('backend_message').map((m) => m[1].message)).not.toContain(
          'Cannot scan during a poll'
        )
      })

      /**
       * The poll's last request, which `stopPolling` does not wait for. The
       * scan's requests queue behind it on the transport rather than going out
       * over it, which on a serial port is the transaction key 1 collision.
       */
      it('queues behind the poll request still on the wire', async () => {
        await connectClient()
        const gated = gateTheReads()
        client.startPolling()
        await vi.advanceTimersByTimeAsync(0)
        expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)

        const scan = client.scanRegisters({ addressRange: [0, 1], length: 1, timeout: 1000 })
        await vi.advanceTimersByTimeAsync(1000)

        // The poll's read has not answered, so the scan has put nothing on the
        // client: one call, and it is the poll's.
        expect(client.state.polling).toBe(false)
        expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)

        // The scan's own reads answer through a fresh mock, because
        // `resolveAll` only resolves the gates that were open when it ran.
        setupHoldingRegisterReadMock([100])
        await gated.resolveAll()
        await vi.advanceTimersByTimeAsync(1000)
        await scan

        expect(mockModbusRTU.readHoldingRegisters.mock.calls.length).toBeGreaterThan(1)
      })

      // A poll starting twice is two callers arriving at once rather than a
      // mistake, so it stays the silent no-op it was.
      it('says nothing when a poll is started while polling', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        client.startPolling()
        await vi.advanceTimersByTimeAsync(100)
        const before = getWindowCalls('backend_message').length

        client.startPolling()

        expect(client.state.polling).toBe(true)
        expect(getWindowCalls('backend_message')).toHaveLength(before)
        client.stopPolling()
      })
    })

    // A write refused before it goes out says why in a snackbar and puts
    // nothing on the wire, so the device holds what it held and there is
    // nothing to read back.
    it('reads nothing back when the write never reached the wire', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      await client.write({
        address: 0,
        type: 'holding_registers',
        value: 100,
        dataType: 'utf8',
        single: false
      })

      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
      expect(getWindowCalls('backend_message').at(-1)?.[1]).toMatchObject({
        message: 'Modbux cannot write a value as UTF-8',
        variant: 'warning'
      })
      expect(client.state.writing).toBe(false)
    })

    it('triggers auto-read after write when not polling', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.writeFC5.mockImplementation(
        (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => cb(null)
      )

      await client.write({ address: 0, type: 'coils', value: [true], single: true })
      // Let the fire-and-forget read complete
      await vi.advanceTimersByTimeAsync(100)

      // A read was triggered (readHoldingRegisters was called from the auto-read)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalled()
    })

    describe('a write while a write is in flight', () => {
      /**
       * FC6, held open. The callback is what the library answers through, so
       * the write is on the wire until a finisher runs.
       */
      const gateTheRegisterWrites = () => {
        const gates: Array<() => void> = []
        mockModbusRTU.writeFC6.mockImplementation(
          (_unitId: number, address: number, _value: number, callback: (error: null) => void) => {
            fileTransaction({ ...createMockTransaction(address), nextCode: 6 })
            gates.push(() => callback(null))
          }
        )
        return {
          resolveAll: async (): Promise<void> => {
            await vi.advanceTimersByTimeAsync(0)
            gates.forEach((gate) => gate())
          }
        }
      }

      const aRegisterWrite = {
        address: 0,
        type: 'holding_registers',
        value: 1,
        dataType: 'uint16',
        single: true
      } as const

      it('sends one request and tells the second caller what is running', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        const gate = gateTheRegisterWrites()

        const first = client.write(aRegisterWrite)
        await vi.advanceTimersByTimeAsync(0)
        await client.write({ ...aRegisterWrite, value: 2 })

        expect(mockModbusRTU.writeFC6).toHaveBeenCalledTimes(1)
        expect(getWindowCalls('backend_message').at(-1)?.[1]).toMatchObject({
          message: 'Cannot write during another write',
          variant: 'warning'
        })

        await gate.resolveAll()
        await first
      })

      it('says a write is running while it runs, and stops saying so', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        const gate = gateTheRegisterWrites()

        const first = client.write(aRegisterWrite)
        await vi.advanceTimersByTimeAsync(0)
        expect(client.state.writing).toBe(true)
        expect(getLastClientState()?.writing).toBe(true)

        await gate.resolveAll()
        await first

        expect(client.state.writing).toBe(false)
        expect(getLastClientState()?.writing).toBe(false)
      })

      it('refuses a read while it runs, which shares the client', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        const gate = gateTheRegisterWrites()

        const first = client.write(aRegisterWrite)
        await vi.advanceTimersByTimeAsync(0)
        await client.read()

        expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
        expect(getWindowCalls('backend_message').at(-1)?.[1]).toMatchObject({
          message: 'Cannot read during another write',
          variant: 'warning'
        })

        await gate.resolveAll()
        await first
      })

      /**
       * The read back is the second half of the write, and the sequence the
       * flag covers is write, wait, read back, wait, free. A second write
       * arriving between the device's answer and the read back's is what a
       * double click on the write cell or a second bit toggle is.
       */
      it('is still running while its read back is', async () => {
        await connectClient()
        const reads = gateTheReads()
        const writes = gateTheRegisterWrites()

        const first = client.write(aRegisterWrite)
        await vi.advanceTimersByTimeAsync(0)
        await writes.resolveAll()
        await vi.advanceTimersByTimeAsync(0)

        expect(client.state.reading).toBe(true)
        expect(client.state.writing).toBe(true)
        await client.write({ ...aRegisterWrite, value: 2 })
        expect(mockModbusRTU.writeFC6).toHaveBeenCalledTimes(1)
        expect(getWindowCalls('backend_message').at(-1)?.[1]).toMatchObject({
          message: 'Cannot write during another write',
          variant: 'warning'
        })

        await reads.resolveAll()
        await first
        expect(client.state.writing).toBe(false)
      })

      it('writes again once the first has answered', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])
        mockModbusRTU.writeFC6.mockImplementation(
          (_unitId: number, _address: number, _value: number, callback: (error: null) => void) =>
            callback(null)
        )

        await client.write(aRegisterWrite)
        await client.write({ ...aRegisterWrite, value: 2 })

        expect(mockModbusRTU.writeFC6).toHaveBeenCalledTimes(2)
      })
    })
  })

  describe('scan unit ids full flow', () => {
    it('calls setID for each unit ID in range', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      // Clear mocks after connect
      mockModbusRTU.setID.mockClear()

      const scanPromise = client.scanUnitIds({
        range: [5, 7],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      expect(mockModbusRTU.setID).toHaveBeenCalledWith(5)
      expect(mockModbusRTU.setID).toHaveBeenCalledWith(6)
      expect(mockModbusRTU.setID).toHaveBeenCalledWith(7)
      expect(mockModbusRTU.setID).toHaveBeenCalledTimes(3)
    })

    it('scans range and emits results for each unit', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 3],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(3)
      expect(results[0]?.[1].id).toBe(1)
      expect(results[1]?.[1].id).toBe(2)
      expect(results[2]?.[1].id).toBe(3)
      expect(results[0]?.[1].registerTypes).toContain('holding_registers')
    })

    it('records errors for failed register type reads', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockRejectedValue(new Error('coils failed'))
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['coils', 'holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].errorMessage.coils).toBe('coils failed')
      expect(results[0]?.[1].registerTypes).toContain('holding_registers')
      expect(results[0]?.[1].registerTypes).not.toContain('coils')
    })

    // The loop reads the flag once, at the top, so a cancel during any register
    // type ends the unit before the next one.
    it('reads no further register type for a unit cancelled mid-list', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockResolvedValue({ data: [true], buffer: Buffer.from([0x01]) })
      mockModbusRTU.readDiscreteInputs.mockImplementation(async () => {
        client.stopScanningUnitIds()
        return { data: [true], buffer: Buffer.from([0x01]) }
      })
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })
      mockModbusRTU.readInputRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

      const scanPromise = client.scanUnitIds({
        range: [1, 5],
        address: 0,
        length: 1,
        registerTypes: ['coils', 'discrete_inputs', 'holding_registers', 'input_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
      expect(mockModbusRTU.readInputRegisters).not.toHaveBeenCalled()
      expect(getWindowCalls('scan_unit_id_result').length).toBe(0)
    })

    // ! Coverage-only: exercises error path for discrete_inputs in scanUnitIds
    it('records error for discrete_inputs read failure', async () => {
      await connectClient()
      mockModbusRTU.readDiscreteInputs.mockRejectedValue(new Error('discrete failed'))
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['discrete_inputs', 'holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].errorMessage.discrete_inputs).toBe('discrete failed')
      expect(results[0]?.[1].registerTypes).not.toContain('discrete_inputs')
    })

    it('stops mid-scan when stopScanningUnitIds is called', async () => {
      await connectClient()
      // A device takes time to answer, and a stop arrives in between.
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 100],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })

      // Stop after a short time
      await vi.advanceTimersByTimeAsync(50)
      client.stopScanningUnitIds()
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      // Should have scanned far fewer than 100 units
      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBeLessThan(100)
      expect(client.state.scanningUnitIds).toBe(false)
    })

    // The test above reads the results, which stop arriving either way. This one
    // reads the loop: `_scanUnitIds` sets the unit id before it reads the flag,
    // so the last id handed to `setID` is the last iteration that ran.
    it('leaves the remaining unit ids unvisited after a cancel', async () => {
      await connectClient()
      // A device takes time to answer, and a stop arrives in between.
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { data: [0], buffer: Buffer.alloc(2) }
      })
      mockModbusRTU.setID.mockClear()

      const scanPromise = client.scanUnitIds({
        range: [1, 100],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })

      // About ten ids in, at a millisecond an answer.
      await vi.advanceTimersByTimeAsync(10)
      client.stopScanningUnitIds()
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const lastId = mockModbusRTU.setID.mock.calls.at(-1)?.[0]
      expect(lastId).toBeLessThan(20)
    })

    it('stops a unit id scan when the connection drops mid-scan', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })
      // 'error' rather than 'close': close schedules a reconnect, and a
      // reconnect calls setID again, which is what this asserts on.
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(async () => {
        fireClientEvent('error', new Error('socket hang up'))
        mockModbusRTU.isOpen = false
        throw new Error('Port Not Open')
      })
      mockModbusRTU.setID.mockClear()

      const scanPromise = client.scanUnitIds({
        range: [1, 100],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const lastId = mockModbusRTU.setID.mock.calls.at(-1)?.[0]
      expect(lastId).toBe(1)
    })

    // The dialogs read this flag out of `client_state` to decide whether Close
    // is live, so the state reporting the disconnect is where it has to be
    // false. The loop sets it false on its own way out, one read later.
    it('the client_state reporting a disconnect says the unit id scan is over', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(async () => {
        await client.disconnect()
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 100],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const states = getWindowCalls('client_state').map((call) => call[1])
      const firstDisconnected = states.find((state) => state.connectState === 'disconnected')
      expect(firstDisconnected?.scanningUnitIds).toBe(false)
    })

    it('scans all four register types', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockResolvedValue({ data: [true], buffer: Buffer.from([0x01]) })
      mockModbusRTU.readDiscreteInputs.mockResolvedValue({
        data: [true],
        buffer: Buffer.from([0x01])
      })
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })
      mockModbusRTU.readInputRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['coils', 'discrete_inputs', 'holding_registers', 'input_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].registerTypes).toContain('coils')
      expect(results[0]?.[1].registerTypes).toContain('discrete_inputs')
      expect(results[0]?.[1].registerTypes).toContain('holding_registers')
      expect(results[0]?.[1].registerTypes).toContain('input_registers')
    })

    it('emits scan progress', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 2],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const progress = getWindowCalls('scan_progress')
      expect(progress.length).toBeGreaterThan(0)
      // Last progress should be 100
      expect(progress.at(-1)?.[1]).toBe(100)
    })

    // The loop visits what was asked for, so a type left out is never read.
    it('skips holding_registers when not in registerTypes', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockResolvedValue({ data: [true], buffer: Buffer.from([0x01]) })
      mockModbusRTU.readInputRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['coils', 'input_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].registerTypes).toContain('coils')
      expect(results[0]?.[1].registerTypes).toContain('input_registers')
      expect(results[0]?.[1].registerTypes).not.toContain('holding_registers')
      // holding_registers should never have been read
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
    })

    // ! Coverage-only: exercises error path for holding_registers in scanUnitIds
    it('records error for holding_registers read failure', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockRejectedValue(new Error('holding reg failed'))
      mockModbusRTU.readInputRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers', 'input_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].errorMessage.holding_registers).toBe('holding reg failed')
      expect(results[0]?.[1].registerTypes).toContain('input_registers')
      expect(results[0]?.[1].registerTypes).not.toContain('holding_registers')
    })

    // ! Coverage-only: exercises error path for input_registers in scanUnitIds
    it('records error for input_registers read failure', async () => {
      await connectClient()
      mockModbusRTU.readInputRegisters.mockRejectedValue(new Error('input reg failed'))
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })

      const scanPromise = client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers', 'input_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const results = getWindowCalls('scan_unit_id_result')
      expect(results.length).toBe(1)
      expect(results[0]?.[1].errorMessage.input_registers).toBe('input reg failed')
      expect(results[0]?.[1].registerTypes).toContain('holding_registers')
      expect(results[0]?.[1].registerTypes).not.toContain('input_registers')
    })

    it('logs the transaction of every probe it made', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        fileTransaction({ ...createMockTransaction(address, length), nextCode: 1 })
        return { data: [false], buffer: Buffer.alloc(1) }
      })
      setupHoldingRegisterReadMock([0])

      const scanPromise = client.scanUnitIds({
        range: [5, 6],
        address: 3,
        length: 1,
        registerTypes: ['coils', 'holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const transactions = getWindowCalls('transaction')
      expect(transactions.map((call) => call[1].code)).toEqual([1, 3, 1, 3])
      expect(Object.keys(mockModbusRTU._transactions)).toEqual([])
    })

    it('logs the transaction of a probe that was refused', async () => {
      await connectClient()
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        fileTransaction(createMockTransaction(address, length))
        throw Object.assign(new Error('Illegal function'), { modbusCode: 1 })
      })

      const scanPromise = client.scanUnitIds({
        range: [5, 5],
        address: 3,
        length: 1,
        registerTypes: ['coils'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const transactions = getWindowCalls('transaction')
      expect(transactions.map((call) => call[1].errorMessage)).toEqual(['Illegal function'])
      expect(Object.keys(mockModbusRTU._transactions)).toEqual([])
    })

    it('logs every probe on a serial port, where they share one key', async () => {
      await connectClient()
      serialPort()
      setupHoldingRegisterReadMock([0])

      const scanPromise = client.scanUnitIds({
        range: [5, 6],
        address: 3,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const transactions = getWindowCalls('transaction')
      expect(transactions.map((call) => call[1].id.split('__')[0])).toEqual(['1', '1'])
      expect(Object.keys(mockModbusRTU._transactions)).toEqual([])
    })
  })

  describe('scan registers full flow', () => {
    it('logs the transaction of every read it made', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      const scanPromise = client.scanRegisters({
        addressRange: [50, 69],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const transactions = getWindowCalls('transaction')
      expect(transactions.map((call) => call[1].address)).toEqual([50, 60])
      expect(Object.keys(mockModbusRTU._transactions)).toEqual([])
    })

    it('sets unit ID before scanning', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      appState.updateConnectionConfig({ unitId: 42 })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 5],
        length: 5,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      expect(mockModbusRTU.setID).toHaveBeenCalledWith(42)
    })

    it('calls setID before the first read operation', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      appState.updateConnectionConfig({ unitId: 99 })

      // Clear mocks after connect (which also calls setID)
      mockModbusRTU.setID.mockClear()
      mockModbusRTU.readHoldingRegisters.mockClear()

      const scanPromise = client.scanRegisters({
        addressRange: [0, 5],
        length: 5,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      // setID must have been called before the first read
      expect(firstCallOrder(mockModbusRTU.setID, 'setID')).toBeLessThan(
        firstCallOrder(mockModbusRTU.readHoldingRegisters, 'readHoldingRegisters')
      )
    })

    it('scans address range and sends non-zero data', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      const scanPromise = client.scanRegisters({
        addressRange: [0, 20],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBeGreaterThan(0)
      expect(client.state.scanningRegisters).toBe(false)
    })

    it('filters out zero-value registers during scan', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        async (address: number, length: number) => {
          mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
          return { data: [0], buffer: Buffer.alloc(2) }
        }
      )

      const scanPromise = client.scanRegisters({
        addressRange: [0, 5],
        length: 1,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      // Zero-value registers are filtered out, so no data should be sent
      const dataCalls = getWindowCalls('register_data')
      dataCalls.forEach((call) => {
        expect(call[1].length).toBe(0)
      })
    })

    describe('how fast a scan runs, and what it reports', () => {
      it('waits for nothing but the device', async () => {
        await connectClient()
        setupHoldingRegisterReadMock([100])

        await client.scanRegisters({ addressRange: [0, 999], length: 10, timeout: 1000 })

        expect(mockModbusRTU.readHoldingRegisters.mock.calls.length).toBe(100)
        expect(client.state.scanningRegisters).toBe(false)
      })

      it('says how far it has got every 100 ms, and 100 at the end', async () => {
        await connectClient()
        mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
          await new Promise((resolve) => setTimeout(resolve, 1))
          return { data: new Array(10).fill(100), buffer: Buffer.alloc(20) }
        })

        const scanPromise = client.scanRegisters({
          addressRange: [0, 9999],
          length: 10,
          timeout: 1000
        })
        await vi.advanceTimersByTimeAsync(2000)
        await scanPromise

        const progress = getWindowCalls('scan_progress').map((call) => call[1])
        // A thousand answers a millisecond apart: a report per 100 ms of them,
        // not one per answer.
        expect(progress.length).toBeGreaterThan(5)
        expect(progress.length).toBeLessThan(20)
        expect(progress.at(-1)).toBe(100)
      })

      it('sends the result of each unit id without waiting', async () => {
        await connectClient()
        mockModbusRTU.readHoldingRegisters.mockResolvedValue({ data: [0], buffer: Buffer.alloc(2) })

        await client.scanUnitIds({
          range: [1, 5],
          address: 0,
          length: 1,
          registerTypes: ['holding_registers'],
          timeout: 1000
        })

        expect(getWindowCalls('scan_unit_id_result').map((call) => call[1].id)).toEqual([
          1, 2, 3, 4, 5
        ])
      })
    })

    it('stops mid-scan when stopScanningRegisters is called', async () => {
      await connectClient()
      // A device takes time to answer, and a stop arrives in between.
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1))
        return { data: new Array(10).fill(100), buffer: Buffer.alloc(20) }
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 1000],
        length: 10,
        timeout: 1000
      })

      await vi.advanceTimersByTimeAsync(50)
      client.stopScanningRegisters()
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      // Should have stopped early
      expect(mockModbusRTU.readHoldingRegisters.mock.calls.length).toBeLessThan(100)
      expect(client.state.scanningRegisters).toBe(false)
    })

    it('gives no result for the id the connection dropped during', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        mockModbusRTU.isOpen = false
        throw new Error('Port Not Open')
      })

      await client.scanUnitIds({
        range: [1, 1],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers', 'input_registers'],
        timeout: 1000
      })

      expect(mockModbusRTU.readInputRegisters).not.toHaveBeenCalled()
      expect(getWindowCalls('scan_unit_id_result')).toEqual([])
      expect(client.state.connectState).toBe('connecting')
    })

    it('stops a register scan when the connection drops mid-scan', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(async () => {
        fireClientEvent('error', new Error('socket hang up'))
        mockModbusRTU.isOpen = false
        throw new Error('Port Not Open')
      })
      mockModbusRTU.readHoldingRegisters.mockClear()

      const scanPromise = client.scanRegisters({
        addressRange: [0, 999],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const lastAddress = mockModbusRTU.readHoldingRegisters.mock.calls.at(-1)?.[0]
      expect(lastAddress).toBe(0)
    })

    // The dialogs read this flag out of `client_state` to decide whether Close
    // is live, so the state reporting the disconnect is where it has to be
    // false. The loop sets it false on its own way out, one read later.
    it('the client_state reporting a disconnect says the register scan is over', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(async () => {
        await client.disconnect()
        return { data: [100], buffer: Buffer.from([0x00, 0x64]) }
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 999],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(5000)
      await scanPromise

      const states = getWindowCalls('client_state').map((call) => call[1])
      const firstDisconnected = states.find((state) => state.connectState === 'disconnected')
      expect(firstDisconnected?.scanningRegisters).toBe(false)
    })

    it('handles read errors during register scan', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        mockModbusRTU._transactions = { '1': createMockTransaction() }
        throw new Error('scan read error')
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 5],
        length: 5,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'scan read error')).toBe(true)
    })

    // ! Coverage-only: exercises address+length clamping in _scanRegister
    it('clamps length when address + length exceeds 65536', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      const scanPromise = client.scanRegisters({
        addressRange: [65530, 65535],
        length: 10,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      // The first read starts at 65530 with length 10, but 65530+10=65540 > 65536
      // so length should be clamped to 65536 - 65530 = 6
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledWith(65530, 6)
    })

    // ! Coverage-only: exercises d.bit filter branch in _scanRegister
    it('filters by bit value when scanning coils', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils' })
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
        return { data: [true, false, true], buffer: Buffer.from([0x05]) }
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 3],
        length: 3,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const dataCalls = getWindowCalls('register_data')
      expect(dataCalls.length).toBeGreaterThan(0)
      // Only registers with bit=true should pass the filter (addresses 0 and 2)
      const sentData = dataCalls[0]?.[1]
      expect(sentData.every((d: { bit: boolean }) => d.bit === true)).toBe(true)
    })

    // The chunk size and the grid's read length are two separate fields, and
    // the chunk is what goes on the wire.
    it('sends every coil a chunk read, not the grid length', async () => {
      await connectClient()
      appState.updateRegisterConfig({ type: 'coils', length: 10 })
      mockModbusRTU.readCoils.mockImplementation(async (address: number, length: number) => {
        mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
        return {
          data: Array.from({ length }, () => true),
          buffer: Buffer.alloc(Math.ceil(length / 8))
        }
      })

      const scanPromise = client.scanRegisters({
        addressRange: [0, 99],
        length: 100,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const sent = getWindowCalls('register_data')[0]?.[1]
      expect(sent.map((row: { id: number }) => row.id)).toEqual(
        Array.from({ length: 100 }, (_, index) => index)
      )
    })

    it('emits scan progress', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

      const scanPromise = client.scanRegisters({
        addressRange: [0, 10],
        length: 5,
        timeout: 1000
      })
      await vi.advanceTimersByTimeAsync(1000)
      await scanPromise

      const progress = getWindowCalls('scan_progress')
      expect(progress.length).toBeGreaterThan(0)
    })
  })

  // They read no connection, so they are the module's, called the way the
  // IPC handlers call them.
  describe('serial port operations', () => {
    const emitMessage = (message: BackendMessage): void =>
      windows.send('backend_message', message, 'main')

    it('listSerialPorts returns mapped port list', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([
        { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
        { path: '/dev/ttyUSB1', manufacturer: undefined }
      ])

      const ports = await serialPorts.listSerialPorts(emitMessage)

      expect(ports).toEqual([
        { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
        { path: '/dev/ttyUSB1', manufacturer: undefined }
      ])
    })

    it('listSerialPorts returns empty array on error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockRejectedValue(new Error('USB error'))

      const ports = await serialPorts.listSerialPorts(emitMessage)

      expect(ports).toEqual([])
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
    })

    it('validateSerialPort returns valid for existing port', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await serialPorts.validateSerialPort('/dev/ttyUSB0', emitMessage)

      expect(result.valid).toBe(true)
      expect(result.message).toContain('available')
    })

    it('validateSerialPort returns invalid for missing port', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await serialPorts.validateSerialPort('/dev/ttyUSB1', emitMessage)

      expect(result.valid).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('validateSerialPort handles error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockRejectedValue(new Error('file not found'))

      const result = await serialPorts.validateSerialPort('/dev/ttyUSB0', emitMessage)

      expect(result.valid).toBe(false)
      expect(result.message).toContain('not found or not available')
    })

    it('validateSerialPort is case-insensitive', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await serialPorts.validateSerialPort('/DEV/TTYUSB0', emitMessage)

      expect(result.valid).toBe(true)
    })
  })

  describe('error event handler', () => {
    // A socket that fails closes too, and the close is what reconnects.
    it('says what failed and leaves the state to what follows', async () => {
      await connectClient()

      fireClientEvent('error', new Error('Test error'))

      expect(getLastClientState().connectState).toBe('connected')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
    })
  })
})
