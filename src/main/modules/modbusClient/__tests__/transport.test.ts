/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConnectionConfig, ConnectState } from '@shared'
import { defaultConnectionConfig } from '@shared'
import type { Windows } from '../../../windows'

/** A `ModbusRTU` whose reads wait until the test answers them. */
const createMockModbusRTU = () => {
  const mock = {
    isOpen: false,
    handlers: {} as Record<string, (...args: unknown[]) => void>,
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      mock.handlers[event] = handler
      return mock
    }),
    removeAllListeners: vi.fn(() => {
      mock.handlers = {}
    }),
    setID: vi.fn(),
    setTimeout: vi.fn(),
    // `connectTCP` writes the client's timeout into the options it is handed,
    // the way `apis/connection.js` does.
    connectTCP: vi.fn(async (_host: string, options: Record<string, unknown>) => {
      options.timeout = 3000
      mock.isOpen = true
    }),
    connectTelnet: vi.fn(),
    connectRTUBuffered: vi.fn(async () => {
      mock.isOpen = true
    }),
    close: vi.fn((callback: () => void) => {
      mock.isOpen = false
      callback()
    }),
    destroy: vi.fn((callback: () => void) => callback()),
    readHoldingRegisters: vi.fn(),
    _transactions: {} as Record<string, unknown>,
    // A serial port never moves this off 1, which is what makes one queue
    // the only thing keeping two requests' log entries apart.
    _port: { _transactionIdWrite: 1 },
    isDebugEnabled: false
  }
  return mock
}

let mockModbusRTU = createMockModbusRTU()

vi.mock('modbus-serial', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCtor: any = vi.fn().mockImplementation(function () {
    return mockModbusRTU
  })
  return { default: MockCtor }
})

import { Transport, TransportClient } from '../transport'
import { Transports } from '../transports'

/** Fire a handler the transport registered, or fail naming the one it did not. */
const fireHandler = (event: 'close' | 'error', ...args: unknown[]): void => {
  const handler = mockModbusRTU.handlers[event]
  if (!handler) throw new Error(`no '${event}' handler registered`)
  handler(...args)
}

let sent: Array<[string, unknown]> = []
const windows = {
  send: vi.fn((event: string, payload: unknown) => {
    sent.push([event, structuredClone(payload)])
  })
} as unknown as Windows

const messages = () =>
  sent.filter(([event]) => event === 'backend_message').map(([, payload]) => payload)

/** A client that records every state the transport put it in. */
const createClient = () => {
  const states: ConnectState[] = []
  const client: TransportClient & { states: ConnectState[]; closed: number } = {
    states,
    closed: 0,
    setConnectState: (state) => {
      states.push(state)
    },
    transportClosed: () => {
      client.closed++
      states.push('disconnected')
    }
  }
  return client
}

const tcp = (host: string): ConnectionConfig => ({
  ...structuredClone(defaultConnectionConfig),
  protocol: 'ModbusTcp',
  tcp: { host, options: { port: 502 } }
})

/**
 * A read that waits for the test, filing its transaction under the port's key
 * the way modbus-serial does when the request goes out.
 */
const gateTheReads = () => {
  const answers: Array<() => void> = []
  mockModbusRTU.readHoldingRegisters.mockImplementation(
    (address: number) =>
      new Promise((resolve) => {
        mockModbusRTU._transactions['1'] = {
          nextAddress: 1,
          nextCode: 3,
          nextLength: 1,
          _timeoutFired: false,
          request: Buffer.from([1, 3, 0, address, 0, 1])
        }
        answers.push(() => resolve({ data: [address], buffer: Buffer.alloc(2) }))
      })
  )
  return {
    answerNext: async () => {
      await vi.advanceTimersByTimeAsync(0)
      const answer = answers.shift()
      if (!answer) throw new Error('no read is waiting for an answer')
      answer()
      await vi.advanceTimersByTimeAsync(0)
    }
  }
}

describe('Transport', () => {
  let transports: Transports

  beforeEach(() => {
    vi.useFakeTimers()
    mockModbusRTU = createMockModbusRTU()
    sent = []
    transports = new Transports(windows)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the queue', () => {
    it('sends a request only once the one before it has answered', async () => {
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(createClient(), tcp('10.0.0.1'))
      const gate = gateTheReads()

      const first = transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(10, 1)
      )
      const second = transport.request({ uuid: 'client-1', unitId: 2, timeout: 2000 }, (modbus) =>
        modbus.readHoldingRegisters(20, 1)
      )
      await vi.advanceTimersByTimeAsync(0)
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)

      await gate.answerNext()
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(2)
      await gate.answerNext()

      await expect(first).resolves.toMatchObject({ data: [10] })
      await expect(second).resolves.toMatchObject({ data: [20] })
    })

    it('sets each request’s own unit id and timeout inside its turn', async () => {
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(createClient(), tcp('10.0.0.1'))
      const gate = gateTheReads()

      void transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(10, 1)
      )
      void transport.request({ uuid: 'client-1', unitId: 2, timeout: 2000 }, (modbus) =>
        modbus.readHoldingRegisters(20, 1)
      )
      await vi.advanceTimersByTimeAsync(0)

      // The second request is queued, and has not set anything yet.
      expect(mockModbusRTU.setID.mock.calls).toEqual([[1]])
      expect(mockModbusRTU.setTimeout).toHaveBeenLastCalledWith(1000)

      await gate.answerNext()
      expect(mockModbusRTU.setID.mock.calls).toEqual([[1], [2]])
      expect(mockModbusRTU.setTimeout).toHaveBeenLastCalledWith(2000)
      await gate.answerNext()
    })

    it('logs each request under its own turn on a key that never moves', async () => {
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(createClient(), tcp('10.0.0.1'))
      const gate = gateTheReads()

      void transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(10, 1)
      )
      void transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(20, 1)
      )
      await gate.answerNext()
      await gate.answerNext()

      const addresses = sent
        .filter(([event]) => event === 'transaction')
        .map(([, event]) => (event as { transaction: { address: number } }).transaction.address)
      expect(addresses).toEqual([10, 20])
    })

    it('sends the next request after one that failed', async () => {
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(createClient(), tcp('10.0.0.1'))
      mockModbusRTU.readHoldingRegisters
        .mockRejectedValueOnce(new Error('Timed out'))
        .mockResolvedValueOnce({ data: [7], buffer: Buffer.alloc(2) })

      const failed = transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(10, 1)
      )
      const next = transport.request({ uuid: 'client-1', unitId: 1, timeout: 1000 }, (modbus) =>
        modbus.readHoldingRegisters(20, 1)
      )

      await expect(failed).rejects.toThrow('Timed out')
      await expect(next).resolves.toMatchObject({ data: [7] })
    })
  })

  describe('the clients riding it', () => {
    it('opens once for two clients, and closes when the last one leaves', async () => {
      const first = createClient()
      const second = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))

      await transport.attach(first, tcp('10.0.0.1'))
      await transport.attach(second, tcp('10.0.0.1'))
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(1)
      expect(second.states).toEqual(['connected'])

      await transport.detach(first, false)
      expect(mockModbusRTU.close).not.toHaveBeenCalled()
      expect(first.states.at(-1)).toBe('disconnected')
      expect(transport.isOpen).toBe(true)

      await transport.detach(second, false)
      expect(mockModbusRTU.close).toHaveBeenCalledTimes(1)
      expect(second.closed).toBe(1)
    })

    it('tells a client joining an open that is under way how it ended', async () => {
      let open: () => void = () => {
        throw new Error('connectTCP was never called')
      }
      mockModbusRTU.connectTCP.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            open = () => {
              mockModbusRTU.isOpen = true
              resolve()
            }
          })
      )
      const first = createClient()
      const second = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))

      const opening = transport.attach(first, tcp('10.0.0.1'))
      await transport.attach(second, tcp('10.0.0.1'))
      expect(second.states).toEqual(['connecting'])

      open()
      await opening
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(1)
      expect(first.states.at(-1)).toBe('connected')
      expect(second.states.at(-1)).toBe('connected')
    })

    it('reports a connection lost to every client riding it', async () => {
      const first = createClient()
      const second = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(first, tcp('10.0.0.1'))
      await transport.attach(second, tcp('10.0.0.1'))

      mockModbusRTU.isOpen = false
      fireHandler('close')

      expect(first.states.at(-1)).toBe('connecting')
      expect(second.states.at(-1)).toBe('connecting')

      await vi.advanceTimersByTimeAsync(3500)
      expect(first.states.at(-1)).toBe('connected')
      expect(second.states.at(-1)).toBe('connected')
    })

    it('refuses a client while the last one’s close is still closing', async () => {
      let closed: () => void = () => {
        throw new Error('close was never called')
      }
      mockModbusRTU.close.mockImplementation((callback: () => void) => {
        closed = () => {
          mockModbusRTU.isOpen = false
          callback()
        }
      })
      const first = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(first, tcp('10.0.0.1'))

      const closing = transport.detach(first, false)
      const late = createClient()
      await transports.acquire(tcp('10.0.0.1')).attach(late, tcp('10.0.0.1'))

      expect(late.states).toEqual([])
      expect(messages().at(-1)).toMatchObject({
        message: 'Still closing that connection, try again in a moment',
        variant: 'warning'
      })

      closed()
      await closing
    })
  })

  describe('a connection found lost', () => {
    // A TCP reset leaves the port shut and says nothing, so the client on it
    // still reads connected when the next one joins.
    it('reconnects every rider when a client joins a port that died silently', async () => {
      const first = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(first, tcp('10.0.0.1'))
      mockModbusRTU.isOpen = false

      const second = createClient()
      await transport.attach(second, tcp('10.0.0.1'))

      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(1)
      expect(first.states.at(-1)).toBe('connecting')
      expect(second.states.at(-1)).toBe('connecting')

      await vi.advanceTimersByTimeAsync(3500)
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(2)
      expect(first.states.at(-1)).toBe('connected')
      expect(second.states.at(-1)).toBe('connected')
    })

    // modbus-serial leaves the port a reconnect replaced listening, and its
    // close reaches the transport after the new port has opened.
    it('ignores a close while the port reads open', async () => {
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(client, tcp('10.0.0.1'))
      const before = sent.length

      fireHandler('close')
      await vi.advanceTimersByTimeAsync(3500)

      expect(sent.slice(before)).toEqual([])
      expect(client.states.at(-1)).toBe('connected')
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(1)
    })

    it('adds nothing to a reconnect whose open is on its way', async () => {
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(client, tcp('10.0.0.1'))
      mockModbusRTU.isOpen = false
      mockModbusRTU.connectTCP.mockImplementation(() => new Promise<void>(() => {}))

      transport.lost()
      await vi.advanceTimersByTimeAsync(3500)
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(2)
      transport.lost()
      await vi.advanceTimersByTimeAsync(3500)

      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(2)
      const lost = messages().filter((message) =>
        String((message as { message: string }).message).startsWith('Connection lost')
      )
      expect(lost).toHaveLength(1)
    })

    it('puts every client on connecting and reconnects once for two reports', async () => {
      const first = createClient()
      const second = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(first, tcp('10.0.0.1'))
      await transport.attach(second, tcp('10.0.0.1'))
      mockModbusRTU.isOpen = false

      transport.lost()
      transport.lost()
      fireHandler('close')

      expect(first.states.at(-1)).toBe('connecting')
      expect(second.states.at(-1)).toBe('connecting')
      const lost = messages().filter((message) =>
        String((message as { message: string }).message).startsWith('Connection lost')
      )
      expect(lost).toHaveLength(1)

      await vi.advanceTimersByTimeAsync(3500)
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(2)
      expect(first.states.at(-1)).toBe('connected')
    })
  })

  describe('what it opens with', () => {
    it('opens with the config of the client that opens it', async () => {
      const serial = (baudRate: '9600' | '19200'): ConnectionConfig => ({
        ...structuredClone(defaultConnectionConfig),
        protocol: 'ModbusRtu',
        rtu: {
          com: 'COM3',
          options: { baudRate, parity: 'none', dataBits: 8, stopBits: 1 }
        }
      })
      const transport = transports.acquire(serial('9600'))

      await transport.attach(createClient(), serial('19200'))

      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalledWith(
        'COM3',
        expect.objectContaining({ baudRate: 19200 })
      )
    })
  })

  describe('the transports main holds', () => {
    it('hands two configs naming one connection the same transport', () => {
      expect(transports.acquire(tcp('10.0.0.1'))).toBe(transports.acquire(tcp('10.0.0.1')))
      expect(transports.acquire(tcp('10.0.0.1'))).not.toBe(transports.acquire(tcp('10.0.0.2')))
    })

    it('lets go of a transport once nothing rides it', async () => {
      const client = createClient()
      const transport: Transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(client, tcp('10.0.0.1'))

      expect(transports.acquire(tcp('10.0.0.1'))).toBe(transport)
      await transport.detach(client, false)
      expect(transports.acquire(tcp('10.0.0.1'))).not.toBe(transport)
    })

    it('keeps a transport whose cancelled open is still opening', async () => {
      let open: () => void = () => {
        throw new Error('connectTCP was never called')
      }
      mockModbusRTU.connectTCP.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            open = () => {
              mockModbusRTU.isOpen = true
              resolve()
            }
          })
      )
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      const opening = transport.attach(client, tcp('10.0.0.1'))
      await transport.detach(client, true)

      expect(transports.acquire(tcp('10.0.0.1'))).toBe(transport)

      open()
      await opening
      expect(transports.acquire(tcp('10.0.0.1'))).not.toBe(transport)
    })
  })
})
