// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  RegisterData,
  defaultClientState,
  defaultConnectionConfig,
  defaultRegisterConfig
} from '@shared'
import type { PersistedClient } from '@renderer/context/client.zustand.types'
import type { ClientData } from '@renderer/context/live.zustand.types'
import type { PersistedServer } from '@renderer/context/server.zustand.types'
import { stubRenderer } from '@renderer/context/__tests__/stubRenderer'
import type { ReadSource } from '../readTools'

// `getConvertedValue` is the grid's, and its module reaches the stores, which
// ask `window.api` as they load.
stubRenderer()
const { McpToolError, getClient, getUnit, listClients, listRegisters, listServers, readValues } =
  await import('../readTools')

const emptyMapping = (): PersistedClient['registerMapping'] => ({
  coils: {},
  discrete_inputs: {},
  input_registers: {},
  holding_registers: {}
})

const meter: PersistedClient = {
  name: 'SDM630',
  registerMapping: {
    ...emptyMapping(),
    holding_registers: {
      0: { dataType: 'uint16', scalingFactor: 0.1, comment: 'voltage L1' },
      1: { dataType: 'int16', comment: 'temperature' },
      // A register whose entry was cleared keeps its key.
      2: undefined
    },
    coils: { 3: { comment: 'breaker' } }
  },
  connectionConfig: {
    ...defaultConnectionConfig,
    unitId: 7,
    tcp: { ...defaultConnectionConfig.tcp, host: '10.0.0.5' }
  },
  registerConfig: { ...defaultRegisterConfig, type: 'holding_registers' }
}

const row = (id: number, hex: string, words: Partial<RegisterData['words']>): RegisterData => ({
  id,
  buffer: new Uint8Array(2),
  hex,
  words: words as RegisterData['words'],
  bit: false,
  isScanned: false
})

const liveOf = (overrides: Partial<ClientData>): ClientData => ({
  registerData: [],
  addressGroups: [],
  clientState: defaultClientState,
  transactions: [],
  lastSuccessfulTransactionMillis: null,
  scanUnitIdResults: [],
  scanProgress: 0,
  ...overrides
})

const simulator: PersistedServer = {
  port: '502',
  unitId: '1',
  name: 'Simulated meter',
  littleEndian: false,
  registers: {
    '1': {
      coils: { 4: { value: true, comment: 'pump' } },
      discrete_inputs: {},
      input_registers: {},
      holding_registers: {
        10: {
          value: 230,
          params: {
            address: 10,
            registerType: 'holding_registers',
            dataType: 'uint16',
            comment: 'setpoint',
            value: 230,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        },
        20: {
          value: 5,
          params: {
            address: 20,
            registerType: 'holding_registers',
            dataType: 'uint16',
            comment: 'noise',
            value: undefined,
            min: 0,
            max: 10,
            interval: 1000
          }
        }
      }
    }
  },
  usedAddresses: {}
}

const source = (overrides: Partial<ReadSource> = {}): ReadSource => ({
  clients: { a: meter },
  live: {
    a: liveOf({
      clientState: { ...defaultClientState, connectState: 'connected', polling: true },
      registerData: [row(0, '0908', { uint16: 2312 }), row(1, 'ffff', { int16: -1 })],
      lastSuccessfulTransactionMillis: Date.parse('2026-09-25T12:00:00Z')
    })
  },
  servers: { s: simulator },
  serverMode: 'tcp',
  serialCom: undefined,
  ...overrides
})

describe('the read tools', () => {
  it('list_clients names each client, where it connects and what it is doing', () => {
    expect(listClients(source())).toEqual([
      {
        id: 'a',
        name: 'SDM630',
        protocol: 'ModbusTcp',
        target: `10.0.0.5:${defaultConnectionConfig.tcp.options.port}`,
        unitId: 7,
        connectState: 'connected',
        polling: true,
        offline: false
      }
    ])
  })

  it('list_clients names a serial client by its COM port', () => {
    const serial: PersistedClient = {
      ...meter,
      connectionConfig: {
        ...meter.connectionConfig,
        protocol: 'ModbusRtu',
        rtu: { ...meter.connectionConfig.rtu, com: '/dev/ttyUSB0' }
      }
    }
    expect(listClients(source({ clients: { a: serial } }))).toMatchObject([
      { target: '/dev/ttyUSB0' }
    ])
  })

  it('get_client answers a client no window has a state for as disconnected', () => {
    expect(getClient(source({ live: {} }), { client: 'a' })).toMatchObject({
      name: 'SDM630',
      state: { connectState: 'disconnected' }
    })
  })

  it('refuses a client id nobody has, naming the tool that lists them', () => {
    expect(() => getClient(source(), { client: 'b' })).toThrow(McpToolError)
    expect(() => getClient(source(), { client: 'b' })).toThrow('list_clients')
  })

  it('list_registers names every mapped register by its comment', () => {
    expect(listRegisters(source(), { client: 'a' })).toEqual([
      {
        type: 'coils',
        address: 3,
        name: 'breaker',
        dataType: undefined,
        scalingFactor: undefined,
        bitMap: undefined
      },
      {
        type: 'holding_registers',
        address: 0,
        name: 'voltage L1',
        dataType: 'uint16',
        scalingFactor: 0.1,
        bitMap: undefined
      },
      {
        type: 'holding_registers',
        address: 1,
        name: 'temperature',
        dataType: 'int16',
        scalingFactor: undefined,
        bitMap: undefined
      }
    ])
  })

  it('read_values answers what the grid shows, scaled', () => {
    expect(readValues(source(), { client: 'a' })).toEqual({
      type: 'holding_registers',
      lastAnswerAt: '2026-09-25T12:00:00.000Z',
      rows: [
        {
          address: 0,
          name: 'voltage L1',
          dataType: 'uint16',
          hex: '0908',
          value: 231.2,
          error: undefined
        },
        {
          address: 1,
          name: 'temperature',
          dataType: 'int16',
          hex: 'ffff',
          value: -1,
          error: undefined
        }
      ]
    })
  })

  it('read_values answers a coil as its bit', () => {
    const coils: PersistedClient = {
      ...meter,
      registerConfig: { ...meter.registerConfig, type: 'coils' }
    }
    const data = liveOf({ registerData: [{ ...row(3, '0001', {}), bit: true }] })
    expect(
      readValues(source({ clients: { a: coils }, live: { a: data } }), { client: 'a' })
    ).toEqual({
      type: 'coils',
      lastAnswerAt: null,
      rows: [
        {
          address: 3,
          name: 'breaker',
          dataType: undefined,
          hex: '0001',
          value: true,
          error: undefined
        }
      ]
    })
  })

  it('list_servers names each server, its port and its units', () => {
    expect(listServers(source())).toEqual([
      { id: 's', name: 'Simulated meter', mode: 'tcp', target: 'port 502', units: ['1'] }
    ])
  })

  it('list_servers names the COM port in RTU mode', () => {
    expect(listServers(source({ serverMode: 'rtu', serialCom: 'COM3' }))).toMatchObject([
      { mode: 'rtu', target: 'COM3' }
    ])
  })

  it('get_unit answers bools and registers, with a generator where one runs', () => {
    expect(getUnit(source(), { server: 's', unit: '1' })).toEqual({
      server: 's',
      unit: '1',
      registers: [
        { type: 'coils', address: 4, name: 'pump', value: true },
        {
          type: 'holding_registers',
          address: 10,
          name: 'setpoint',
          dataType: 'uint16',
          value: 230,
          generator: undefined
        },
        {
          type: 'holding_registers',
          address: 20,
          name: 'noise',
          dataType: 'uint16',
          value: 5,
          generator: { min: 0, max: 10, interval: 1000 }
        }
      ]
    })
  })

  it('get_unit refuses a unit the server does not host', () => {
    expect(() => getUnit(source(), { server: 's', unit: '2' })).toThrow('has no unit 2')
    expect(() => getUnit(source(), { server: 's', unit: '999' })).toThrow('has no unit 999')
  })

  it('get_unit refuses a server id nobody has', () => {
    expect(() => getUnit(source(), { server: 'x', unit: '1' })).toThrow('list_servers')
  })
})
