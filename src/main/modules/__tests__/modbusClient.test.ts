/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Protocol, RawTransaction } from '@shared'
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
  // The port modbus-serial files transactions against. A TCP port counts from
  // 1, and `RTUBufferedPort` defines no such field, which is why every serial
  // transaction files under the string "undefined".
  _port: { _transactionIdWrite: 1 } as { _transactionIdWrite: number | undefined },
  isDebugEnabled: false
})

let mockModbusRTU = createMockModbusRTU()

/** Every client constructed since the last `beforeEach`, oldest first. */
let modbusInstances: Array<ReturnType<typeof createMockModbusRTU>> = []

vi.mock('modbus-serial', () => {
  // Must use `function` (not arrow) so it can be called with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCtor: any = vi.fn().mockImplementation(function () {
    // A client per construction, because the one the disconnect timeout
    // replaces has to stay distinguishable from the one replacing it.
    mockModbusRTU = createMockModbusRTU()
    modbusInstances.push(mockModbusRTU)
    return mockModbusRTU
  })
  MockCtor.getPorts = vi.fn().mockResolvedValue([])
  return { default: MockCtor }
})

import { ModbusClient } from '../modbusClient'
import ModbusRTU from 'modbus-serial'

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

const createMockWindows = (): Windows =>
  ({
    send: vi.fn((event: string, ...args: unknown[]) => {
      sentToWindows.push([event, ...args.map((arg) => structuredClone(arg))])
    }),
    // `sendTo` puts the addressee first and the event second, and a test that
    // reads the payload wants the same shape either way. The addressee is
    // recorded beside it, because who a message reached is its own question.
    sendTo: vi.fn((target: unknown, event: string, ...args: unknown[]) => {
      sentToWindows.push([event, ...args.map((arg) => structuredClone(arg))])
      addressedTo.push([target, event])
    })
  }) as unknown as Windows

describe('ModbusClient', () => {
  let client: ModbusClient
  let windows: Windows
  let appState: AppState

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
    windows = createMockWindows()
    appState = new AppState()
    client = new ModbusClient({ appState, windows })
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

  /**
   * File a transaction the way modbus-serial does.
   *
   * `writeFCx` files under the port's current write id and the port increments
   * it once the buffer is out, so a request filed here takes the key the client
   * read before the call. The increment is skipped on a serial port, which has
   * no id to increment.
   */
  const fileTransaction = (transaction: RawTransaction = createMockTransaction()): string => {
    const key = String(mockModbusRTU._port._transactionIdWrite)
    mockModbusRTU._transactions = { ...mockModbusRTU._transactions, [key]: transaction }
    const { _transactionIdWrite } = mockModbusRTU._port
    if (_transactionIdWrite !== undefined) {
      mockModbusRTU._port._transactionIdWrite = _transactionIdWrite + 1
    }
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
      resolveAll: (): void => {
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

    it('emits "Already connected" warning if client is open', async () => {
      mockModbusRTU.isOpen = true

      await client.connect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Already connected')).toBe(true)
    })

    it('sets unitId and timeout before connecting', async () => {
      appState.updateConnectionConfig({ unitId: 42 })

      await client.connect()

      expect(mockModbusRTU.setID).toHaveBeenCalledWith(42)
      expect(mockModbusRTU.setTimeout).toHaveBeenCalledWith(3000)
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

    it('resets consecutive reconnects after 10s stability', async () => {
      await connectClient()
      // Advance past the 10s reconnect reset timeout
      await vi.advanceTimersByTimeAsync(11000)

      // Trigger close events — counter was reset so it starts fresh
      fireClientEvent('close')
      expect(getLastClientState().connectState).toBe('connecting')
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
    it('leaves the client it abandons with a sink, and the one replacing it listening', async () => {
      await connectClient()
      mockModbusRTU.close.mockImplementation(() => {})

      const disconnectPromise = client.disconnect()
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      // An `error` listener and nothing else: modbus-serial's `_onError` emits
      // on the client, `destroy` leaves that relay on a serial port, and an
      // `error` with no listener is what Node throws on.
      expect(Object.keys(constructedClient(0).handlers)).toEqual(['error'])
      expect(Object.keys(constructedClient(1).handlers).sort()).toEqual(['close', 'error'])

      const before = getWindowCalls('backend_message').length
      fireOn(constructedClient(0), 'error', new Error('the port faulted'))
      expect(getWindowCalls('backend_message').length).toBe(before)
    })

    // `clientEventHandlers` holds the newest registration, so emptying it
    // first is what makes the two below see the registration itself.
    it('re-registers its handlers on the client the timeout replaces', async () => {
      await connectClient()
      mockModbusRTU.close.mockImplementation(() => {})

      clientEventHandlers = {}
      const disconnectPromise = client.disconnect()
      await vi.advanceTimersByTimeAsync(5500)
      await disconnectPromise

      expect(Object.keys(clientEventHandlers).sort()).toEqual(['close', 'error'])

      // And they still do the work: a close on the replacement reconnects.
      mockModbusRTU.isOpen = false
      await connectClient()
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

  describe('auto-reconnect', () => {
    it('schedules reconnect on close event', async () => {
      await connectClient()

      fireClientEvent('close')

      expect(getLastClientState().connectState).toBe('connecting')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('reconnecting'))).toBe(true)
    })

    it('gives up after max consecutive reconnects', async () => {
      await connectClient()

      // Let the initial 10s reconnect-reset timer expire so it doesn't interfere
      await vi.advanceTimersByTimeAsync(11000)

      // Simulate 5 consecutive close events (max)
      for (let i = 0; i < 5; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('Too many consecutive reconnect'))).toBe(
        true
      )
      expect(getLastClientState().connectState).toBe('disconnected')
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
    // ! Coverage-only: exercises close handler when auto-reconnect is exhausted
    it('emits "Connection closed unexpectedly" when auto-reconnect is disabled', async () => {
      await connectClient()
      // Disable auto-reconnect by exhausting reconnects
      await vi.advanceTimersByTimeAsync(11000)
      for (let i = 0; i < 5; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

      // Now auto-reconnect is disabled. Trigger another close.
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()
      fireClientEvent('close')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Connection closed unexpectedly')).toBe(true)
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
      gates.resolveAll()
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
      // The first chain cannot take its read back, so both are in flight and
      // what the second start must not leave behind is a second chain.
      client.stopPolling()
      client.startPolling()
      await vi.advanceTimersByTimeAsync(0)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(2)

      gates.resolveAll()
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(3)

      client.stopPolling()
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

    it('scanRegisters refuses when the port closed under a connected state', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([0])
      mockModbusRTU.isOpen = false

      await client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Cannot scan, not connected')).toBe(true)
      expect(mockModbusRTU.readHoldingRegisters).not.toHaveBeenCalled()
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

      gate.resolveAll()
      await first
    })

    it('says a read is running while it runs, and stops saying so', async () => {
      await connectClient()
      const gate = gateTheReads()

      const first = client.read()
      expect(client.state.reading).toBe(true)
      expect(getLastClientState().reading).toBe(true)

      gate.resolveAll()
      await first

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

      gate.resolveAll()
      await first
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

    it('keeps the serial transaction key, which is not a number', async () => {
      await connectClient()
      // RTU has no transaction ids, so modbus-serial files every serial
      // transaction under this one key.
      mockModbusRTU._port._transactionIdWrite = undefined
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        fileTransaction()
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()

      const txCalls = getWindowCalls('transaction')
      expect(txCalls[0]?.[1].id).toContain('undefined__')
      expect(txCalls[0]?.[1].id).not.toContain('NaN')
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

    // What `_logTransaction` takes is the last entry in `_transactions`, and it
    // deletes the entry it logs. So a write that files no transaction of its
    // own logs somebody else's and takes it out of the table, and `_onReceive`
    // drops a response whose entry is gone.
    describe('the transaction a write logs', () => {
      /**
       * A read in flight, which is the entry the table holds when a write
       * arrives. The read is gated so it stays in flight for the whole test:
       * the read after a write would otherwise answer and log an entry of its
       * own.
       */
      const aReadInFlight = () => {
        gateTheReads()
        fileTransaction()
      }

      it('logs nothing when the coil list is empty', async () => {
        await connectClient()
        aReadInFlight()

        await client.write({ address: 5, type: 'coils', value: [], single: true })

        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs nothing when FC15 is asked for an empty coil list', async () => {
        await connectClient()
        aReadInFlight()

        writeCoilsLikeTheLibrary(null)

        await client.write({ address: 5, type: 'coils', value: [], single: false })

        expect(mockModbusRTU.writeFC15).not.toHaveBeenCalled()
        const messages = getWindowCalls('backend_message')
        expect(messages.some((m) => m[1].message === 'No coil value to write')).toBe(true)
        expect(getWindowCalls('transaction')).toHaveLength(0)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      it('logs nothing when a single register is asked for a 32 bit value', async () => {
        await connectClient()
        aReadInFlight()

        await client.write({
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

        await client.write({
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

        await client.write({ address: 5, type: 'coils', value: [true], single: true })

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

        await client.write({ address: 5, type: 'coils', value: [true], single: true })

        const transactions = getWindowCalls('transaction')
        expect(transactions).toHaveLength(1)
        expect(transactions[0]?.[1].id).toContain('2__')
        expect(transactions[0]?.[1].code).toBe(5)
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['1'])
      })

      // Nothing refuses a poll the user starts while a write is on the wire,
      // so two requests are filed and only one of them is this write's.
      it('logs its own while a read it did not start is in flight', async () => {
        await connectClient()
        const finishers: Array<() => void> = []
        mockModbusRTU.writeFC5.mockImplementation(
          (_unitId: number, address: number, _value: boolean, callback: (err: null) => void) => {
            fileTransaction({ ...createMockTransaction(address), nextCode: 5 })
            finishers.push(() => callback(null))
          }
        )
        // The poll's read files its transaction and then waits for an answer
        // that never comes, which is where the write finds it.
        mockModbusRTU.readHoldingRegisters.mockImplementation(
          (address: number) =>
            new Promise(() => {
              fileTransaction(createMockTransaction(address))
            })
        )

        const writePromise = client.write({
          address: 5,
          type: 'coils',
          value: [true],
          single: true
        })
        await vi.advanceTimersByTimeAsync(0)
        client.startPolling()
        await vi.advanceTimersByTimeAsync(0)

        const [finishWrite] = finishers
        if (!finishWrite) throw new Error('writeFC5 was never called')
        finishWrite()
        await writePromise

        const transactions = getWindowCalls('transaction')
        expect(transactions).toHaveLength(1)
        expect(transactions[0]?.[1].id).toContain('1__')
        expect(transactions[0]?.[1].code).toBe(5)
        // The read's entry, which `_onReceive` delivers its answer into.
        expect(Object.keys(mockModbusRTU._transactions)).toEqual(['2'])

        client.stopPolling()
      })

      it('logs the transaction of a write the device refused', async () => {
        await connectClient()
        aReadInFlight()
        writeCoilsLikeTheLibrary(new Error('Modbus exception 2: Illegal data address'))

        await client.write({ address: 5, type: 'coils', value: [true], single: true })

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

    it('skips the read after a write when a scan starts during it', async () => {
      await connectClient()
      gateTheReads()
      const finishers: Array<() => void> = []
      mockModbusRTU.writeFC5.mockImplementation(
        (_uid: number, _addr: number, _val: boolean, cb: (err: null) => void) => {
          finishers.push(() => cb(null))
        }
      )

      const writePromise = client.write({ address: 0, type: 'coils', value: [true], single: true })
      await vi.advanceTimersByTimeAsync(0)

      // The scan owns the client from here, and its own first read is the one
      // call that follows.
      client.scanRegisters({ addressRange: [50, 69], length: 10, timeout: 1000 })
      await vi.advanceTimersByTimeAsync(0)
      expect(client.state.scanningRegisters).toBe(true)

      const [finishWrite] = finishers
      if (!finishWrite) throw new Error('writeFC5 was never called')
      // The read after a write would be refused and say so, and the user asked
      // for neither, so the messages after the write are the ones before it.
      const messagesBeforeFinish = getWindowCalls('backend_message').map((m) => m[1].message)
      finishWrite()
      await writePromise

      expect(getWindowCalls('backend_message').map((m) => m[1].message)).toEqual(
        messagesBeforeFinish
      )
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)

      client.stopScanningRegisters()
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
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
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
      mockModbusRTU.readHoldingRegisters.mockResolvedValue({
        data: [0],
        buffer: Buffer.alloc(2)
      })
      mockModbusRTU.setID.mockClear()

      const scanPromise = client.scanUnitIds({
        range: [1, 100],
        address: 0,
        length: 1,
        registerTypes: ['holding_registers'],
        timeout: 1000
      })

      await vi.advanceTimersByTimeAsync(50)
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
      mockModbusRTU._port._transactionIdWrite = undefined
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
      expect(transactions.map((call) => call[1].id.split('__')[0])).toEqual([
        'undefined',
        'undefined'
      ])
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

    it('stops mid-scan when stopScanningRegisters is called', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])

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

    it('stops a register scan when the connection drops mid-scan', async () => {
      await connectClient()
      setupHoldingRegisterReadMock([100])
      mockModbusRTU.readHoldingRegisters.mockImplementationOnce(async () => {
        fireClientEvent('error', new Error('socket hang up'))
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

  describe('serial port operations', () => {
    it('listSerialPorts returns mapped port list', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([
        { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
        { path: '/dev/ttyUSB1', manufacturer: undefined }
      ])

      const ports = await client.listSerialPorts()

      expect(ports).toEqual([
        { path: '/dev/ttyUSB0', manufacturer: 'FTDI' },
        { path: '/dev/ttyUSB1', manufacturer: undefined }
      ])
    })

    it('listSerialPorts returns empty array on error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockRejectedValue(new Error('USB error'))

      const ports = await client.listSerialPorts()

      expect(ports).toEqual([])
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
    })

    it('validateSerialPort returns valid for existing port', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await client.validateSerialPort('/dev/ttyUSB0')

      expect(result.valid).toBe(true)
      expect(result.message).toContain('available')
    })

    it('validateSerialPort returns invalid for missing port', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await client.validateSerialPort('/dev/ttyUSB1')

      expect(result.valid).toBe(false)
      expect(result.message).toContain('not found')
    })

    it('validateSerialPort handles error', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockRejectedValue(new Error('file not found'))

      const result = await client.validateSerialPort('/dev/ttyUSB0')

      expect(result.valid).toBe(false)
      expect(result.message).toContain('not found or not available')
    })

    it('validateSerialPort is case-insensitive', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(ModbusRTU as any).getPorts.mockResolvedValue([{ path: '/dev/ttyUSB0' }])

      const result = await client.validateSerialPort('/DEV/TTYUSB0')

      expect(result.valid).toBe(true)
    })
  })

  describe('error event handler', () => {
    it('transitions to disconnected on error', () => {
      fireClientEvent('error', new Error('Test error'))

      expect(getLastClientState().connectState).toBe('disconnected')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'error')).toBe(true)
    })
  })
})
