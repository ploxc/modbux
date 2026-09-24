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
    _port: { _transactionIdWrite: 1 } as
      | { _transactionIdWrite: number; destroy?: () => void }
      | undefined,
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

/** File a read's transaction under the port's key, the way modbus-serial does when it goes out. */
const fileTransaction = (address: number): void => {
  mockModbusRTU._transactions['1'] = {
    nextAddress: 1,
    nextCode: 3,
    nextLength: 1,
    _timeoutFired: false,
    request: Buffer.from([1, 3, 0, address, 0, 1])
  }
}

/** A read that waits for the test, filing its transaction when it goes out. */
const gateTheReads = () => {
  const answers: Array<() => void> = []
  mockModbusRTU.readHoldingRegisters.mockImplementation(
    (address: number) =>
      new Promise((resolve) => {
        fileTransaction(address)
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
      const rider = createClient()
      await transport.attach(rider, tcp('10.0.0.1'))
      const gate = gateTheReads()

      const first = transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(10, 1)
      )
      const second = transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 2, timeout: 2000 },
        (modbus) => modbus.readHoldingRegisters(20, 1)
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
      const rider = createClient()
      await transport.attach(rider, tcp('10.0.0.1'))
      const gate = gateTheReads()

      void transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(10, 1)
      )
      void transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 2, timeout: 2000 },
        (modbus) => modbus.readHoldingRegisters(20, 1)
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
      const rider = createClient()
      await transport.attach(rider, tcp('10.0.0.1'))
      const gate = gateTheReads()

      void transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(10, 1)
      )
      void transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(20, 1)
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
      const rider = createClient()
      await transport.attach(rider, tcp('10.0.0.1'))
      mockModbusRTU.readHoldingRegisters
        .mockRejectedValueOnce(new Error('Timed out'))
        .mockResolvedValueOnce({ data: [7], buffer: Buffer.alloc(2) })

      const failed = transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(10, 1)
      )
      const next = transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout: 1000 },
        (modbus) => modbus.readHoldingRegisters(20, 1)
      )

      await expect(failed).rejects.toThrow('Timed out')
      await expect(next).resolves.toMatchObject({ data: [7] })
    })
  })

  /**
   * What modbus-serial 8.0.25 does to a request and an open it catches: a
   * request rejects with "Timed out" once its timeout passes, and never with
   * no timeout; `close` takes the reply listener off, so no answer arrives
   * after it; `destroy` clears every pending timeout and drops an opening
   * socket's callback, calling none of them back.
   */
  describe('what a disconnect leaves waiting', () => {
    const likeTheLibrary = () => {
      const stranded = new Set<() => void>()
      const answers: Array<() => void> = []
      let listening = true
      mockModbusRTU.readHoldingRegisters.mockImplementation(
        (address: number) =>
          new Promise((resolve, reject) => {
            // modbus-serial 8.0.25 answers a request on a shut port at once.
            if (!mockModbusRTU.isOpen) {
              reject(new Error('Port Not Open'))
              return
            }
            const timeout = mockModbusRTU.setTimeout.mock.calls.at(-1)?.[0]
            if (timeout) {
              const timer = setTimeout(() => reject(new Error('Timed out')), timeout)
              stranded.add(() => clearTimeout(timer))
            }
            fileTransaction(address)
            answers.push(() => {
              if (listening) resolve({ data: [address], buffer: Buffer.alloc(2) })
            })
          })
      )
      const close = mockModbusRTU.close.getMockImplementation()
      if (!close) throw new Error('close has no implementation to wrap')
      mockModbusRTU.close.mockImplementation((callback: () => void) => {
        listening = false
        close(callback)
      })
      mockModbusRTU.destroy.mockImplementation((callback: () => void) => {
        for (const strand of stranded) strand()
        callback()
      })
      return {
        /** A connect that fails after three seconds, as one to a host that drops packets does. */
        openThatTimesOut: () =>
          mockModbusRTU.connectTCP.mockImplementation(
            () =>
              new Promise<void>((_resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('connect ETIMEDOUT')), 3000)
                stranded.add(() => clearTimeout(timer))
              })
          ),
        answerNext: () => {
          const answer = answers.shift()
          if (!answer) throw new Error('no read is waiting for an answer')
          answer()
        }
      }
    }

    /** How a promise ended, read after the timers have run rather than awaited. */
    const track = (promise: Promise<unknown>) => {
      const ending: { is: string } = { is: 'pending' }
      promise.then(
        () => (ending.is = 'resolved'),
        (error: Error) => (ending.is = `rejected: ${error.message}`)
      )
      return ending
    }

    const readOn = (transport: Transport, rider: TransportClient, timeout: number) =>
      transport.request(
        { current: () => transport.rides(rider), uuid: 'client-1', unitId: 1, timeout },
        (modbus) => modbus.readHoldingRegisters(10, 1)
      )

    const connected = async () => {
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(client, tcp('10.0.0.1'))
      return { client, transport }
    }

    // A TCP reset shuts the port and emits nothing, so nothing calls `lost`.
    it('rejects the read a silent reset left on the wire when the last client leaves', async () => {
      const { client, transport } = await connected()
      likeTheLibrary()
      const read = track(readOn(transport, client, 1000))
      await vi.advanceTimersByTimeAsync(0)

      mockModbusRTU.isOpen = false
      await transport.detach(client, false)
      await vi.advanceTimersByTimeAsync(0)

      expect(read).toEqual({ is: 'rejected: Connection closed' })
    })

    it('lets go of a connect cancelled while it opens, once the open gives up', async () => {
      likeTheLibrary().openThatTimesOut()
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      const opening = track(transport.attach(client, tcp('10.0.0.1')))
      await vi.advanceTimersByTimeAsync(200)

      await transport.detach(client, true)
      await vi.advanceTimersByTimeAsync(3000)

      expect(opening).toEqual({ is: 'resolved' })
      expect(transports.acquire(tcp('10.0.0.1'))).not.toBe(transport)
    })

    it('destroys the socket of an open that failed', async () => {
      likeTheLibrary().openThatTimesOut()
      const portDestroy = vi.fn()
      mockModbusRTU._port = { _transactionIdWrite: 1, destroy: portDestroy }
      const client = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      void transport.attach(client, tcp('10.0.0.1'))
      await vi.advanceTimersByTimeAsync(200)

      await transport.detach(client, true)
      await vi.advanceTimersByTimeAsync(3000)

      expect(portDestroy).toHaveBeenCalledTimes(1)
      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
    })

    it('rejects the read a drop left on the wire at the drop', async () => {
      const { client, transport } = await connected()
      likeTheLibrary()
      const read = track(readOn(transport, client, 8000))
      await vi.advanceTimersByTimeAsync(0)

      mockModbusRTU.isOpen = false
      fireHandler('close')
      await vi.advanceTimersByTimeAsync(0)

      expect(read).toEqual({ is: 'rejected: Connection lost' })
    })

    it('lets the read queued behind a dropped one go at the drop', async () => {
      const { client, transport } = await connected()
      likeTheLibrary()
      void readOn(transport, client, 8000).catch(() => undefined)
      const queued = track(readOn(transport, client, 8000))
      await vi.advanceTimersByTimeAsync(0)

      mockModbusRTU.isOpen = false
      fireHandler('close')
      await vi.advanceTimersByTimeAsync(0)

      expect(queued).toEqual({ is: 'rejected: Port Not Open' })
    })

    it('sends nothing queued behind the last client’s read once it has left', async () => {
      mockModbusRTU.close.mockImplementation(() => {})
      const { client, transport } = await connected()
      likeTheLibrary()
      void readOn(transport, client, 1000).catch(() => undefined)
      const queued = track(readOn(transport, client, 1000))
      await vi.advanceTimersByTimeAsync(0)

      // The close is still closing when the rejected read lets the queue on.
      void transport.detach(client, false)
      await vi.advanceTimersByTimeAsync(0)

      expect(queued).toEqual({ is: 'rejected: Connection closed' })
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
    })

    it('logs the read the last client left on the wire under that client', async () => {
      const { client, transport } = await connected()
      likeTheLibrary()
      void readOn(transport, client, 1000).catch(() => undefined)
      await vi.advanceTimersByTimeAsync(0)

      await transport.detach(client, false)
      await vi.advanceTimersByTimeAsync(0)

      const logged = sent
        .filter(([event]) => event === 'transaction')
        .map(([, event]) => event as { uuid: string; transaction: { errorMessage?: string } })
      expect(logged.map(({ uuid, transaction }) => [uuid, transaction.errorMessage])).toEqual([
        ['client-1', 'Connection closed']
      ])
    })

    it('says why a serial open that threw before it made a port failed', async () => {
      mockModbusRTU._port = undefined
      mockModbusRTU.connectRTUBuffered.mockImplementation(() => {
        throw new TypeError('"path" is not defined: ')
      })
      const blank: ConnectionConfig = {
        ...structuredClone(defaultConnectionConfig),
        protocol: 'ModbusRtu',
        rtu: { ...structuredClone(defaultConnectionConfig.rtu), com: '' }
      }
      const client = createClient()
      const transport = transports.acquire(blank)

      await transport.attach(client, blank)

      expect(messages()).toContainEqual(expect.objectContaining({ variant: 'error' }))
      expect(client.states.at(-1)).toBe('disconnected')
    })

    it('lets go of a port whose close threw at once', async () => {
      mockModbusRTU.close.mockImplementation(() => {
        throw new Error('Port is not open')
      })
      const { client, transport } = await connected()

      await transport.detach(client, false)

      expect(messages()).toContainEqual(expect.objectContaining({ message: 'Port is not open' }))
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
    })

    // tcpport's close ends the socket and keeps the callback it was handed,
    // which a second close replaces. The socket's idle timer answers it with
    // an error and leaves the port reading open. The peer's FIN or reset, if
    // either comes, shuts the port and answers whatever callback is kept.
    // `handleCallback` empties the slot after the call rather than before, so a
    // close asked for inside the answer loses its callback.
    const closeThatTimesOut = (
      peer?: { answers: 'fin' | 'reset'; after: number },
      idle: { at: number; rearmedAt?: number } = { at: 3000 }
    ) => {
      let kept: ((error?: Error) => void) | undefined
      const answer = (error?: Error) => {
        kept?.(error)
        kept = undefined
      }
      // `ModbusRTU.destroy` calls `tcpport.destroy()` with no callback, which
      // empties the kept one, and destroys the socket, whose `close` shuts the
      // port after an immediate an earlier answer queued. The fake clock runs
      // the two in the order they were created.
      mockModbusRTU.destroy.mockImplementation((callback: () => void) => {
        kept = undefined
        setImmediate(() => (mockModbusRTU.isOpen = false))
        callback()
      })
      let ended = false
      mockModbusRTU.close.mockImplementation((callback: (error?: Error) => void) => {
        kept = callback
        if (ended) return
        ended = true
        setTimeout(() => answer(new Error('TCP Connection Timed Out')), idle.at)
        if (idle.rearmedAt !== undefined) {
          setTimeout(() => answer(new Error('TCP Connection Timed Out')), idle.rearmedAt)
        }
        if (!peer) return
        setTimeout(() => {
          mockModbusRTU.isOpen = false
          answer(peer.answers === 'reset' ? new Error('read ECONNRESET') : undefined)
        }, peer.after)
      })
      return { idleTimerFires: () => answer(new Error('TCP Connection Timed Out')) }
    }

    // The idle timer counts from the traffic before the close, and traffic
    // after its first answer re-arms it, which answers the close that asked
    // again the same way.
    it('keeps asking through a second error answer', async () => {
      closeThatTimesOut({ answers: 'fin', after: 4500 }, { at: 500, rearmedAt: 3500 })
      const { client, transport } = await connected()

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(4499)
      expect(leaving).toEqual({ is: 'pending' })
      await vi.advanceTimersByTimeAsync(1)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    it('lets go of a port at once when the close it asks again throws', async () => {
      closeThatTimesOut()
      const { client, transport } = await connected()
      const first = mockModbusRTU.close.getMockImplementation()
      if (!first) throw new Error('close has no implementation to wrap')
      mockModbusRTU.close.mockImplementationOnce(first).mockImplementationOnce(() => {
        throw new Error('Port is not open')
      })

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(3001)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      expect(messages()).toContainEqual(expect.objectContaining({ message: 'Port is not open' }))
      await vi.advanceTimersByTimeAsync(5000)
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
    })

    // A reset right after the idle answer finds nobody's callback kept.
    it('takes a port that shut before it was asked again as closed', async () => {
      closeThatTimesOut({ answers: 'reset', after: 3000 })
      const { client, transport } = await connected()

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(3001)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    // An idle timer due in the same tick as the give-up, and armed before it,
    // asks again once the port has been let go of.
    it('asks nothing more of a port it let go of', async () => {
      const socket = closeThatTimesOut()
      const { client, transport } = await connected()
      setTimeout(socket.idleTimerFires, 5000)

      await Promise.all([transport.detach(client, false), vi.advanceTimersByTimeAsync(5000)])
      await vi.advanceTimersByTimeAsync(1000)

      expect(mockModbusRTU.close).toHaveBeenCalledTimes(2)
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
    })

    it('lets go of a port that still reads open five seconds into its close', async () => {
      closeThatTimesOut()
      const { client, transport } = await connected()

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(4999)
      expect(leaving).toEqual({ is: 'pending' })
      await vi.advanceTimersByTimeAsync(1)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      expect(messages()).toContainEqual(
        expect.objectContaining({ message: 'Disconnect timeout, the connection was dropped' })
      )
    })

    it('waits out an error answer for a FIN that arrives inside the five seconds', async () => {
      closeThatTimesOut({ answers: 'fin', after: 4000 })
      const { client, transport } = await connected()

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(3999)
      expect(leaving).toEqual({ is: 'pending' })
      await vi.advanceTimersByTimeAsync(1)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    it('takes a reset after an error answer as closed', async () => {
      closeThatTimesOut({ answers: 'reset', after: 3500 })
      const { client, transport } = await connected()

      const leaving = track(transport.detach(client, false))
      await vi.advanceTimersByTimeAsync(3500)

      expect(leaving).toEqual({ is: 'resolved' })
      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    // A peer that answers the FIN with a reset: tcpport's socket `error` shuts
    // the port and calls the close back with the error. A serial close whose
    // binding failed answers the same way, because the binding clears its
    // descriptor first.
    it('takes an error answer from a port that reads shut as closed', async () => {
      mockModbusRTU.close.mockImplementation((callback: (error?: Error) => void) => {
        mockModbusRTU.isOpen = false
        callback(new Error('read ECONNRESET'))
      })
      const { client, transport } = await connected()

      await transport.detach(client, false)

      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    // A serial port reads shut from the moment its close starts until it answers.
    it('lets go of a port whose close never answers while it reads shut', async () => {
      mockModbusRTU.close.mockImplementation(() => {
        mockModbusRTU.isOpen = false
      })
      const { client, transport } = await connected()

      await Promise.all([transport.detach(client, false), vi.advanceTimersByTimeAsync(5000)])

      expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      expect(messages()).toContainEqual(
        expect.objectContaining({ message: 'Disconnect timeout, the connection was dropped' })
      )
    })

    it('destroys nothing of a port whose close answered', async () => {
      const { client, transport } = await connected()

      await transport.detach(client, false)

      expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      expect(messages().at(-1)).toMatchObject({ message: 'Disconnected from server' })
    })

    describe('a connect cancelled while it opens, whose port opens after all', () => {
      const cancelledOpen = async () => {
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
        const opening = track(transport.attach(client, tcp('10.0.0.1')))
        await transport.detach(client, true)
        open()
        return { transport, opening }
      }

      it('lets go of that port when its close never answers', async () => {
        mockModbusRTU.close.mockImplementation(() => {})
        const { transport, opening } = await cancelledOpen()

        await vi.advanceTimersByTimeAsync(5000)

        expect(opening).toEqual({ is: 'resolved' })
        expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
        expect(Object.keys(mockModbusRTU.handlers)).toEqual(['error'])
        expect(transports.acquire(tcp('10.0.0.1'))).not.toBe(transport)
      })

      it('lets go of that port when it still reads open five seconds into its close', async () => {
        closeThatTimesOut()
        const { opening } = await cancelledOpen()

        await vi.advanceTimersByTimeAsync(5000)

        expect(opening).toEqual({ is: 'resolved' })
        expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      })

      it('lets go of that port at once when its close throws', async () => {
        mockModbusRTU.close.mockImplementation(() => {
          throw new Error('Port is not open')
        })
        const { opening } = await cancelledOpen()

        await vi.advanceTimersByTimeAsync(0)
        expect(opening).toEqual({ is: 'resolved' })
        expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
        await vi.advanceTimersByTimeAsync(5000)
        expect(mockModbusRTU.destroy).toHaveBeenCalledTimes(1)
      })

      it('destroys nothing of that port when its close answers', async () => {
        const { opening } = await cancelledOpen()

        await vi.advanceTimersByTimeAsync(0)

        expect(opening).toEqual({ is: 'resolved' })
        expect(mockModbusRTU.destroy).not.toHaveBeenCalled()
      })
    })

    it('rejects the read on the wire when the last client leaves an open port', async () => {
      const { client, transport } = await connected()
      likeTheLibrary()
      const read = track(readOn(transport, client, 1000))
      await vi.advanceTimersByTimeAsync(0)

      await transport.detach(client, false)
      await vi.advanceTimersByTimeAsync(0)

      expect(read).toEqual({ is: 'rejected: Connection closed' })
    })

    /** Two clients on one connection, the first with a read on the wire. */
    const twoRiders = async () => {
      const { client: leaving, transport } = await connected()
      const staying = createClient()
      await transport.attach(staying, tcp('10.0.0.1'))
      const library = likeTheLibrary()
      return { leaving, staying, transport, library }
    }

    it('leaves a leaving client’s read on the wire to its answer while another rides', async () => {
      const { leaving, transport, library } = await twoRiders()
      const read = track(readOn(transport, leaving, 1000))
      await vi.advanceTimersByTimeAsync(0)

      await transport.detach(leaving, false)
      library.answerNext()
      await vi.advanceTimersByTimeAsync(0)

      expect(read).toEqual({ is: 'resolved' })
    })

    it('sends nothing a client queued before it left while another rides', async () => {
      const { leaving, staying, transport, library } = await twoRiders()
      const read = track(readOn(transport, staying, 1000))
      const queued = track(readOn(transport, leaving, 1000))
      await vi.advanceTimersByTimeAsync(0)

      await transport.detach(leaving, false)
      library.answerNext()
      await vi.advanceTimersByTimeAsync(0)

      expect(read).toEqual({ is: 'resolved' })
      expect(queued).toEqual({ is: 'rejected: Connection closed' })
      expect(mockModbusRTU.readHoldingRegisters).toHaveBeenCalledTimes(1)
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

    /**
     * Drop the connection and let the burst reopen it, `times` over, up to the
     * five a burst makes. Each drop lands inside the ten seconds in which the
     * burst keeps its count, so the count goes up by `times`.
     */
    const dropAndReopen = async (times: number) => {
      for (let i = 0; i < times; i++) {
        mockModbusRTU.isOpen = false
        fireHandler('close')
        await vi.advanceTimersByTimeAsync(3500)
      }
    }

    /** The messages a drop sends, which carry the count or say the burst gave up. */
    const lostMessages = () =>
      messages().filter((message) =>
        (message as { message: string }).message.startsWith('Connection lost')
      )
    const lastLost = () => lostMessages().at(-1)

    const afterReconnects = async (times: number) => {
      const first = createClient()
      const second = createClient()
      const transport = transports.acquire(tcp('10.0.0.1'))
      await transport.attach(first, tcp('10.0.0.1'))
      await dropAndReopen(times)
      return { first, second, transport }
    }

    it.each([2, 5])(
      'starts a fresh burst for a client that joins a port that died silently after %i reconnects',
      async (times) => {
        const { first, second, transport } = await afterReconnects(times)
        mockModbusRTU.isOpen = false

        await transport.attach(second, tcp('10.0.0.1'))
        expect(lastLost()).toMatchObject({ message: 'Connection lost, reconnecting (1/5)...' })
        await vi.advanceTimersByTimeAsync(3500)

        expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(times + 2)
        expect(first.states.at(-1)).toBe('connected')
        expect(second.states.at(-1)).toBe('connected')
      }
    )

    // The button reads Disconnect for a rider, but the channel takes a connect.
    it('starts a fresh burst for a rider that connects again', async () => {
      const { first, second, transport } = await afterReconnects(5)
      mockModbusRTU.isOpen = false
      await transport.attach(second, tcp('10.0.0.1'))
      await vi.advanceTimersByTimeAsync(3500)
      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(7)
      await dropAndReopen(4)
      expect(lastLost()).toMatchObject({ message: 'Connection lost, reconnecting (5/5)...' })
      mockModbusRTU.isOpen = false

      await transport.attach(first, tcp('10.0.0.1'))
      expect(lastLost()).toMatchObject({ message: 'Connection lost, reconnecting (1/5)...' })
      await vi.advanceTimersByTimeAsync(3500)

      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(12)
      expect(first.states.at(-1)).toBe('connected')
      expect(second.states.at(-1)).toBe('connected')
    })

    it.each(['waits to reopen', 'is reopening'] as const)(
      'leaves the count of a burst a client joins while it %s',
      async (moment) => {
        const { second, transport } = await afterReconnects(4)
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
        mockModbusRTU.isOpen = false
        fireHandler('close')
        if (moment === 'is reopening') await vi.advanceTimersByTimeAsync(3500)

        await transport.attach(second, tcp('10.0.0.1'))
        await vi.advanceTimersByTimeAsync(3500)
        open()
        await vi.advanceTimersByTimeAsync(0)
        expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(6)
        expect(second.states.at(-1)).toBe('connected')
        mockModbusRTU.isOpen = false
        fireHandler('close')

        expect(lastLost()).toMatchObject({
          message: 'Connection lost, too many consecutive reconnect attempts, giving up'
        })
      }
    )

    it('gives up when a rider finds that port shut instead', async () => {
      const { first, second, transport } = await afterReconnects(5)
      await transport.attach(second, tcp('10.0.0.1'))
      mockModbusRTU.isOpen = false

      transport.lost()
      await vi.advanceTimersByTimeAsync(3500)

      expect(mockModbusRTU.connectTCP).toHaveBeenCalledTimes(6)
      expect(first.states.at(-1)).toBe('disconnected')
      expect(second.states.at(-1)).toBe('disconnected')
      expect(lastLost()).toMatchObject({
        message: 'Connection lost, too many consecutive reconnect attempts, giving up'
      })
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
      const lost = lostMessages()
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
      const lost = lostMessages()
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

  describe('a second client on an open serial port', () => {
    const serial = (
      options: Partial<ConnectionConfig['rtu']['options']> = {}
    ): ConnectionConfig => ({
      ...structuredClone(defaultConnectionConfig),
      protocol: 'ModbusRtu',
      rtu: {
        com: 'COM3',
        options: { baudRate: '9600', parity: 'none', dataBits: 8, stopBits: 1, ...options }
      }
    })

    it('joins on the line settings the port is open at', async () => {
      const transport = transports.acquire(serial())
      await transport.attach(createClient(), serial())

      const second = createClient()
      await transport.attach(second, serial())

      expect(second.states.at(-1)).toBe('connected')
      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['baud rate', { baudRate: '19200' as const }],
      ['parity', { parity: 'even' as const }],
      ['data bits', { dataBits: 7 as const }],
      ['stop bits', { stopBits: 2 as const }]
    ])('is refused on another %s, and told the settings it is open at', async (_label, options) => {
      const transport = transports.acquire(serial())
      await transport.attach(createClient(), serial())

      const second = createClient()
      expect(transport.refuses(second, serial(options))).toBe(true)
      await transport.attach(second, serial(options))

      expect(second.states).toEqual([])
      expect(transport.rides(second)).toBe(false)
      expect(messages().at(-1)).toMatchObject({
        message:
          'COM3 is open at 9600 8N1 for another client. Use the same serial settings to share it',
        variant: 'warning'
      })
    })

    // A rider is on the line the port is open at, whatever its config says
    // since it joined.
    it('leaves a client that rides it alone, whatever settings it names now', async () => {
      const first = createClient()
      const transport = transports.acquire(serial())
      await transport.attach(first, serial())
      await transport.attach(createClient(), serial())

      await transport.attach(first, serial({ baudRate: '19200' }))

      expect(messages().at(-1)).toMatchObject({ message: 'Already connected' })
    })

    // A TCP config carries serial options too, which nothing opens.
    it('leaves a TCP connection alone whatever serial options its clients carry', async () => {
      const transport = transports.acquire(tcp('10.0.0.1'))
      const rider = createClient()
      await transport.attach(rider, tcp('10.0.0.1'))
      const other = tcp('10.0.0.1')
      other.rtu.options.baudRate = '19200'

      const second = createClient()
      await transport.attach(second, other)

      expect(second.states.at(-1)).toBe('connected')
    })

    it('opens on any settings once nothing rides it', async () => {
      const first = createClient()
      const transport = transports.acquire(serial())
      await transport.attach(first, serial())
      await transport.detach(first, false)

      const next = transports.acquire(serial({ baudRate: '19200' }))
      await next.attach(createClient(), serial({ baudRate: '19200' }))

      expect(mockModbusRTU.connectRTUBuffered).toHaveBeenLastCalledWith(
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
