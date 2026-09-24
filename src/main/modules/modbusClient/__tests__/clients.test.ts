/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Windows } from '../../../windows'

/** One `ModbusRTU` per transport, opening at once and answering every read. */
const createMockModbusRTU = () => {
  const mock = {
    isOpen: false,
    on: vi.fn(() => mock),
    setID: vi.fn(),
    setTimeout: vi.fn(),
    connectTCP: vi.fn(async (_host: string, options: Record<string, unknown>) => {
      options.timeout = 3000
      mock.isOpen = true
    }),
    connectRTUBuffered: vi.fn(async () => {
      mock.isOpen = true
    }),
    close: vi.fn((callback: () => void) => {
      mock.isOpen = false
      callback()
    }),
    destroy: vi.fn((callback: () => void) => callback()),
    readHoldingRegisters: vi.fn(async (address: number) => {
      mock._transactions[String(mock._port._transactionIdWrite)] = {
        nextAddress: 1,
        nextCode: 3,
        nextLength: 1,
        _timeoutFired: false,
        request: Buffer.from([1, 3, 0, address, 0, 1])
      }
      return { data: [address], buffer: Buffer.from([0, address]) }
    }),
    _transactions: {} as Record<string, unknown>,
    _port: { _transactionIdWrite: 1 },
    isDebugEnabled: false
  }
  return mock
}

let instances: Array<ReturnType<typeof createMockModbusRTU>> = []

vi.mock('modbus-serial', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockCtor: any = vi.fn().mockImplementation(function () {
    const instance = createMockModbusRTU()
    instances.push(instance)
    return instance
  })
  return { default: MockCtor }
})

import { Clients } from '../clients'

let sent: Array<[string, Record<string, unknown>]> = []
const windows = {
  send: vi.fn((event: string, payload: Record<string, unknown>) => {
    sent.push([event, structuredClone(payload)])
  })
} as unknown as Windows

const messages = () =>
  sent.filter(([event]) => event === 'backend_message').map(([, payload]) => payload['message'])

describe('Clients', () => {
  let clients: Clients

  beforeEach(() => {
    vi.useFakeTimers()
    instances = []
    sent = []
    clients = new Clients(windows)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps a client off a serial port open at other settings, and lets it on at the same', async () => {
    const serial = (uuid: string, baudRate: '9600' | '19200') =>
      clients.updateConnectionConfig({
        uuid,
        connectionConfig: { protocol: 'ModbusRtu', rtu: { com: 'COM3', options: { baudRate } } }
      })
    clients.create('a')
    clients.create('b')
    serial('a', '9600')
    serial('b', '19200')
    await clients.get('a')?.connect()

    await clients.get('b')?.connect()

    expect(clients.get('b')?.state.connectState).toBe('disconnected')
    expect(messages().at(-1)).toBe(
      'COM3 is open at 9600 8N1 for another client. Use the same serial settings to share it'
    )

    expect(serial('b', '9600')).toBe(true)
    await clients.get('b')?.connect()

    expect(clients.get('b')?.state.connectState).toBe('connected')
    expect(instances).toHaveLength(1)
  })

  describe('a connection change while the client rides a connection', () => {
    const connected = async () => {
      clients.create('a')
      await clients.get('a')?.connect()
      expect(clients.get('a')?.state.connectState).toBe('connected')
    }

    it('is refused, and says so', async () => {
      await connected()
      const host = clients.get('a')?.config.connectionConfig.tcp.host

      expect(
        clients.updateConnectionConfig({
          uuid: 'a',
          connectionConfig: { tcp: { host: '10.0.0.9' } }
        })
      ).toBeUndefined()

      expect(clients.get('a')?.config.connectionConfig.tcp.host).toBe(host)
      expect(messages().at(-1)).toBe('Disconnect before changing the connection')
    })

    it('takes a unit id, which goes out with each request', async () => {
      await connected()

      expect(clients.updateConnectionConfig({ uuid: 'a', connectionConfig: { unitId: 9 } })).toBe(
        true
      )
      expect(clients.get('a')?.config.connectionConfig.unitId).toBe(9)
    })

    // A window that comes back hands main the config it loaded.
    it('takes the config it already holds, and says nothing', async () => {
      await connected()
      const count = messages().length
      const client = clients.get('a')
      if (!client) throw new Error('no client a')
      const connectionConfig = structuredClone(client.config.connectionConfig)

      expect(clients.updateConnectionConfig({ uuid: 'a', connectionConfig })).toBe(true)
      expect(messages()).toHaveLength(count)
    })
  })

  describe('the config a window makes a client with', () => {
    it('is the client\u2019s when main makes it', () => {
      clients.create('a', { connectionConfig: { unitId: 7 }, registerConfig: { address: 40 } })

      expect(clients.get('a')?.config.connectionConfig.unitId).toBe(7)
      expect(clients.get('a')?.config.registerConfig.address).toBe(40)
    })

    // A window that comes back hands over what it stored, which can hold a
    // field it kept invalid and never sent.
    it('leaves the connection of a client that rides one, and says nothing', async () => {
      clients.create('a')
      await clients.get('a')?.connect()
      const host = clients.get('a')?.config.connectionConfig.tcp.host
      const count = messages().length

      clients.create('a', {
        connectionConfig: { unitId: 9, tcp: { host: '' } },
        registerConfig: { address: 40 }
      })

      expect(clients.get('a')?.config.connectionConfig.tcp.host).toBe(host)
      expect(clients.get('a')?.config.connectionConfig.unitId).toBe(9)
      expect(clients.get('a')?.config.registerConfig.address).toBe(40)
      expect(messages()).toHaveLength(count)
    })

    // A reload after the store was cleared, which is what the e2e suite does
    // between files.
    it('is taken whole by a client main holds that rides nothing', () => {
      clients.create('a', { connectionConfig: { unitId: 7 }, registerConfig: { address: 40 } })

      clients.create('a', {
        connectionConfig: { unitId: 1, tcp: { host: '10.0.0.9' } },
        registerConfig: { address: 0 }
      })

      expect(clients.get('a')?.config.connectionConfig.tcp.host).toBe('10.0.0.9')
      expect(clients.get('a')?.config.connectionConfig.unitId).toBe(1)
      expect(clients.get('a')?.config.registerConfig.address).toBe(0)
    })
  })

  it('takes a connection change while the client is disconnected', () => {
    clients.create('a')

    expect(
      clients.updateConnectionConfig({ uuid: 'a', connectionConfig: { tcp: { host: '10.0.0.9' } } })
    ).toBe(true)
    expect(clients.get('a')?.config.connectionConfig.tcp.host).toBe('10.0.0.9')
  })

  it('makes a client once, and leaves it alone when asked again', () => {
    clients.create('a')
    const first = clients.get('a')
    clients.create('a')

    expect(clients.get('a')).toBe(first)
    expect(Object.keys(clients.states())).toEqual(['a'])
  })

  it('answers undefined for a uuid nobody created, and says so', () => {
    expect(clients.get('nobody')).toBeUndefined()
    expect(clients.updateConnectionConfig({ uuid: 'nobody', connectionConfig: {} })).toBeUndefined()
    expect(
      clients.setReadConfiguration({ uuid: 'nobody', readConfiguration: true })
    ).toBeUndefined()
    expect(messages()).toEqual([
      'That client does not exist, nothing was changed',
      'That client does not exist, nothing was changed',
      'That client does not exist, nothing was changed'
    ])
  })

  // The convention `update_connection_config`'s doc comment states: a channel
  // whose payload can be refused says whether it took it, so the store can read
  // the refusal rather than diverge from main in silence.
  it('answers true for a config it took', () => {
    clients.create('a')

    expect(clients.updateConnectionConfig({ uuid: 'a', connectionConfig: { unitId: 3 } })).toBe(
      true
    )
    expect(clients.updateRegisterConfig({ uuid: 'a', registerConfig: { address: 40 } })).toBe(true)
    expect(
      clients.setRegisterMapping({
        uuid: 'a',
        registerMapping: {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: {}
        }
      })
    ).toBe(true)
    expect(clients.setReadConfiguration({ uuid: 'a', readConfiguration: true })).toBe(true)
    expect(clients.get('a')?.config.connectionConfig.unitId).toBe(3)
    expect(clients.get('a')?.config.registerConfig.address).toBe(40)
  })

  it('keeps one client’s config out of another’s', () => {
    clients.create('a')
    clients.create('b')

    clients.updateConnectionConfig({ uuid: 'a', connectionConfig: { unitId: 7 } })

    expect(clients.get('b')?.config.connectionConfig.unitId).not.toBe(7)
  })

  it('takes a client away, and lets go of its connection first', async () => {
    clients.create('a')
    clients.create('b')
    await clients.get('a')?.connect()
    await clients.get('b')?.connect()
    const [instance] = instances

    await clients.delete('a')
    expect(Object.keys(clients.states())).toEqual(['b'])
    expect(instance?.close).not.toHaveBeenCalled()

    await clients.delete('b')
    expect(instance?.close).toHaveBeenCalledTimes(1)
    expect(messages()).not.toContain('Already disconnected')
  })

  it('takes a client nobody connected away without a word', async () => {
    clients.create('a')

    await clients.delete('a')

    expect(Object.keys(clients.states())).toEqual([])
    expect(messages()).toEqual([])
  })

  describe('two clients on one connection', () => {
    const connectBoth = async () => {
      clients.create('a')
      clients.create('b')
      clients.updateConnectionConfig({ uuid: 'a', connectionConfig: { unitId: 1 } })
      clients.updateConnectionConfig({ uuid: 'b', connectionConfig: { unitId: 2 } })
      await clients.get('a')?.connect()
      await clients.get('b')?.connect()
    }

    it('opens it once', async () => {
      await connectBoth()

      expect(instances).toHaveLength(1)
      expect(instances[0]?.connectTCP).toHaveBeenCalledTimes(1)
      expect(clients.states()['a']?.connectState).toBe('connected')
      expect(clients.states()['b']?.connectState).toBe('connected')
    })

    it('reads each client under its own unit id, and names it on what comes back', async () => {
      await connectBoth()

      await Promise.all([clients.get('a')?.read(), clients.get('b')?.read()])

      expect(instances[0]?.setID.mock.calls).toEqual([[1], [2]])
      const named = (event: string) =>
        sent.filter(([name]) => name === event).map(([, payload]) => payload['uuid'])
      expect(named('transaction')).toEqual(['a', 'b'])
      expect(named('register_data')).toEqual(['a', 'b'])
    })

    it('stays open for one client when the other disconnects', async () => {
      await connectBoth()

      await clients.get('a')?.disconnect()

      expect(instances[0]?.close).not.toHaveBeenCalled()
      expect(clients.states()['a']?.connectState).toBe('disconnected')
      expect(clients.states()['b']?.connectState).toBe('connected')
    })
  })
})
