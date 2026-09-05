/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Protocol, Windows } from '@shared'
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

const createMockModbusRTU = () => ({
  isOpen: false,
  on: vi.fn(function (this: unknown, event: string, handler: (...args: unknown[]) => void) {
    clientEventHandlers[event] = handler
    return this
  }),
  setTimeout: vi.fn(),
  setID: vi.fn(),
  connectTCP: vi.fn().mockResolvedValue(undefined),
  connectRTUBuffered: vi.fn().mockResolvedValue(undefined),
  connectTelnet: vi.fn().mockResolvedValue(undefined),
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
  isDebugEnabled: false
})

let mockModbusRTU = createMockModbusRTU()

vi.mock('modbus-serial', () => {
  // Must use `function` (not arrow) so it can be called with `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCtor: any = vi.fn().mockImplementation(function () {
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

const createMockWindows = (): Windows =>
  ({
    send: vi.fn((event: string, ...args: unknown[]) => {
      sentToWindows.push([event, ...args.map((arg) => structuredClone(arg))])
    })
  }) as unknown as Windows

describe('ModbusClient', () => {
  let client: ModbusClient
  let windows: Windows
  let appState: AppState

  beforeEach(() => {
    vi.useFakeTimers()
    clientEventHandlers = {}
    mockModbusRTU = createMockModbusRTU()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ModbusRTU as any).getPorts.mockReset()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ModbusRTU as any).getPorts.mockResolvedValue([])
    sentToWindows = []
    windows = createMockWindows()
    appState = new AppState()
    client = new ModbusClient({ appState, windows })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper: simulate a successful TCP connection
  const connectClient = async () => {
    mockModbusRTU.connectTCP.mockImplementation(async () => {
      mockModbusRTU.isOpen = true
    })
    await client.connect()
  }

  const getWindowCalls = (event: string) => sentToWindows.filter((call) => call[0] === event)

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

  // Helper: setup read mocks that return valid data and populate _transactions
  const setupHoldingRegisterReadMock = (data: number[] = [100]) => {
    const buf = Buffer.alloc(data.length * 2)
    data.forEach((v, i) => buf.writeUInt16BE(v, i * 2))
    mockModbusRTU.readHoldingRegisters.mockImplementation(
      async (address: number, length: number) => {
        mockModbusRTU._transactions = { '1': createMockTransaction(address, length) }
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

      expect(mockModbusRTU.connectTCP).toHaveBeenCalledWith('192.168.1.10', {
        port: 502,
        timeout: 5000
      })

      expect(getLastClientState().connectState).toBe('connected')

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].variant === 'success')).toBe(true)
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
      mockModbusRTU.connectRTUBuffered.mockResolvedValue(undefined)

      await client.connect()

      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalled()
      expect(mockModbusRTU.connectTCP).not.toHaveBeenCalled()
    })

    it('uses encapsulated RTU over TCP (raw RTU frames via connectTelnet) when protocol is ModbusRtuOverTcp', async () => {
      appState.updateConnectionConfig({ protocol: 'ModbusRtuOverTcp' })
      mockModbusRTU.connectTelnet.mockResolvedValue(undefined)

      await client.connect()

      // connectTelnet sends the RTU frame (with CRC) unchanged over TCP.
      // connectTCP / connectTcpRTUBuffered would speak MBAP (plain Modbus TCP).
      expect(mockModbusRTU.connectTelnet).toHaveBeenCalledWith('192.168.1.10', {
        port: 502,
        timeout: 5000
      })
      expect(mockModbusRTU.connectTCP).not.toHaveBeenCalled()
      expect(mockModbusRTU.connectRTUBuffered).not.toHaveBeenCalled()
    })

    it('emits "Already connected" warning if client is open', async () => {
      mockModbusRTU.isOpen = true

      await client.connect()

      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message === 'Already connected')).toBe(true)
    })

    it('sets unitId and timeout before connecting', async () => {
      appState.updateConnectionConfig({ unitId: 42 })
      mockModbusRTU.connectTCP.mockResolvedValue(undefined)

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

      expect(mockModbusRTU.destroy).toHaveBeenCalled()
      const messages = getWindowCalls('backend_message')
      expect(messages.some((m) => m[1].message.includes('Disconnect timeout'))).toBe(true)
    })

    // The mock constructor hands out one shared object, so the replacement is
    // the same instance and its handlers are still attached. Emptying the
    // record first is what makes the two below see the registration itself.
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

    it('suppresses close message when the port closes during a deliberate disconnect', async () => {
      await connectClient()

      // A serial port emits 'close' while close() is running — before the
      // callback that resolves disconnect(). Firing it afterwards, as a naive
      // test does, misses the race entirely.
      mockModbusRTU.close.mockImplementation((cb: () => void) => {
        mockModbusRTU.isOpen = false
        fireClientEvent('close')
        cb()
      })
      ;(windows.send as ReturnType<typeof vi.fn>).mockClear()
      await client.disconnect()

      const messages = getWindowCalls('backend_message')
      expect(messages.every((m) => m[1].message !== 'Connection closed unexpectedly')).toBe(true)
      expect(messages.some((m) => m[1].message === 'Disconnected from server')).toBe(true)
    })

    it('still reports an unexpected close after an earlier deliberate disconnect', async () => {
      // A disconnect whose port never emits 'close' leaves the flag set; the
      // next connect has to clear it or the next real drop goes unreported.
      await connectClient()
      await client.disconnect()

      await connectClient()
      await vi.advanceTimersByTimeAsync(11000)
      for (let i = 0; i < 5; i++) {
        fireClientEvent('close')
        await vi.advanceTimersByTimeAsync(3500)
      }

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

  describe('_logTransaction', () => {
    it('formats and sends transaction data after read', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        mockModbusRTU._transactions = {
          '42': {
            nextAddress: 1,
            nextDataAddress: 0,
            nextCode: 3,
            nextLength: 10,
            _timeoutFired: false,
            request: Buffer.from([0x01, 0x03, 0x00, 0x00, 0x00, 0x0a]),
            responses: [Buffer.from([0x01, 0x03, 0x14])]
          }
        }
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
        if (callCount === 1) mockModbusRTU._transactions = { '1': createMockTransaction() }
        return { data: [0], buffer: Buffer.alloc(2) }
      })

      await client.read()
      await client.read()

      expect(getWindowCalls('transaction')).toHaveLength(1)
    })

    it('leaves a transaction it did not log alone', async () => {
      await connectClient()
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        // Key 1 is a request still in flight, key 2 the one this read
        // finished. modbus-serial drops a response whose entry is gone, so
        // taking 1 out with 2 times that request out instead of answering it.
        mockModbusRTU._transactions = {
          '1': createMockTransaction(50),
          '2': createMockTransaction(0)
        }
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
        mockModbusRTU._transactions = { '1': createMockTransaction() }
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
        mockModbusRTU._transactions = {
          undefined: {
            nextAddress: 1,
            nextDataAddress: 0,
            nextCode: 3,
            nextLength: 10,
            _timeoutFired: false
          }
        }
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
      mockModbusRTU.readHoldingRegisters.mockImplementation(async () => {
        // RTU has no transaction ids, so modbus-serial files every serial
        // transaction under this one key.
        mockModbusRTU._transactions = { undefined: createMockTransaction() }
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
        mockModbusRTU._transactions = { [String(callCount)]: createMockTransaction(address) }
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
        mockModbusRTU._transactions = {
          '1': { ...createMockTransaction(), _timeoutFired: true }
        }
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
  })

  describe('scan registers full flow', () => {
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
