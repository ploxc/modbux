// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  RegisterData,
  ScanUnitIDResult,
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
const {
  McpToolError,
  getClient,
  getScan,
  getUnit,
  listClients,
  listRegisters,
  listServers,
  readValues
} = await import('../readTools')

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
      littleEndian: false,
      lastAnswerAt: '2026-09-25T12:00:00.000Z',
      rows: [
        {
          address: 0,
          name: 'voltage L1',
          dataType: 'uint16',
          hex: '0908',
          words: ['0908'],
          scalingFactor: 0.1,
          value: 231.2,
          error: undefined
        },
        {
          address: 1,
          name: 'temperature',
          dataType: 'int16',
          hex: 'ffff',
          words: ['ffff'],
          scalingFactor: undefined,
          value: -1,
          error: undefined
        }
      ]
    })
  })

  // Enough to rebuild the value without another tool: the byte order once,
  // and per register its scaling and every word it spans.
  it('read_values carries the word order, the scaling and every word of a register', () => {
    const power: PersistedClient = {
      ...meter,
      registerMapping: {
        ...emptyMapping(),
        holding_registers: {
          10: { dataType: 'int32', scalingFactor: 0.001, comment: 'Active Power (kW)' },
          13: { dataType: 'utf8', comment: 'Model' },
          // An address held open inside the string, which the string reads through.
          14: { dataType: 'none' },
          15: { dataType: 'uint16', comment: 'after the string' }
        }
      },
      registerConfig: { ...meter.registerConfig, littleEndian: true }
    }
    const data = liveOf({
      registerData: [
        row(10, '0112', { int32: 18011580 }),
        row(11, 'd6bc', {}),
        row(12, '0000', {}),
        row(13, '5355', { utf8: 'SUN2000\u0000' }),
        row(14, '4e32', {}),
        row(15, '0001', { uint16: 1 })
      ]
    })

    const answer = readValues(source({ clients: { a: power }, live: { a: data } }), {
      client: 'a'
    }) as { littleEndian: boolean; rows: Record<string, unknown>[] }

    expect(answer.littleEndian).toBe(true)
    expect(answer.rows[0]).toMatchObject({
      address: 10,
      scalingFactor: 0.001,
      words: ['0112', 'd6bc']
    })
    expect(answer.rows[1]).toMatchObject({ address: 11, hex: 'd6bc', words: undefined })
    expect(answer.rows[2]).toMatchObject({ address: 12, words: undefined })
    // A string runs to the next mapped register, as the grid slices it.
    // Client 'a' is not the one on screen, so this is sliced by its own rows.
    expect(answer.rows[3]).toMatchObject({
      address: 13,
      words: ['5355', '4e32'],
      value: 'SUN2'
    })
    expect(answer.rows[4]).toMatchObject({ address: 14, words: undefined })
    expect(answer.rows[5]).toMatchObject({ address: 15, words: ['0001'], scalingFactor: undefined })
  })

  // A 0 in place of words that were not read is not a reading.
  it('read_values answers no value for a register whose last word was not read', () => {
    const tail: PersistedClient = {
      ...meter,
      registerMapping: {
        ...emptyMapping(),
        holding_registers: { 20: { dataType: 'int32', comment: 'cut off' } }
      }
    }
    const data = liveOf({ registerData: [row(20, 'abcd', { int32: 0 })] })

    const answer = readValues(source({ clients: { a: tail }, live: { a: data } }), {
      client: 'a'
    }) as { rows: Record<string, unknown>[] }

    expect(answer.rows[0]).toMatchObject({ words: ['abcd', ''], value: undefined })
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
      littleEndian: false,
      lastAnswerAt: null,
      rows: [
        {
          address: 3,
          name: 'breaker',
          dataType: undefined,
          hex: '0001',
          words: undefined,
          scalingFactor: undefined,
          value: true,
          error: undefined
        }
      ]
    })
  })

  it('list_registers carries interpolation and the end of a read group', () => {
    const interpolate = { x1: '0', x2: '100', y1: '4', y2: '20' }
    const interpolated: PersistedClient = {
      ...meter,
      registerMapping: {
        ...emptyMapping(),
        holding_registers: { 0: { dataType: 'uint16', interpolate, groupEnd: true } }
      }
    }
    expect(listRegisters(source({ clients: { a: interpolated } }), { client: 'a' })).toEqual([
      expect.objectContaining({ address: 0, interpolate, groupEnd: true })
    ])
  })

  it('read_values says a value is interpolated, and a bitmap its bits as the panel shows them', () => {
    const interpolate = { x1: '0', x2: '100', y1: '4', y2: '20' }
    const mapped: PersistedClient = {
      ...meter,
      registerMapping: {
        ...emptyMapping(),
        holding_registers: {
          0: { dataType: 'uint16', interpolate },
          1: {
            dataType: 'bitmap',
            bitMap: {
              '0': { comment: 'fault', color: 'error', invert: true },
              '1': { comment: 'run' }
            }
          }
        }
      }
    }
    const live = liveOf({
      registerData: [row(0, '0032', { uint16: 50 }), row(1, '0003', { uint16: 3 })]
    })
    const answer = readValues(source({ clients: { a: mapped }, live: { a: live } }), {
      client: 'a'
    }) as {
      rows: { interpolate?: unknown; value?: unknown; bits?: unknown[] }[]
    }
    expect(answer.rows[0]).toMatchObject({ interpolate, value: 12 })
    expect(answer.rows[0]?.bits).toBeUndefined()
    expect(answer.rows[1]?.bits?.slice(0, 3)).toEqual([
      { bit: 0, on: true, active: false, comment: 'fault', color: 'error', invert: true },
      { bit: 1, on: true, active: true, comment: 'run', color: undefined, invert: undefined },
      { bit: 2, on: false, active: false, comment: undefined, color: undefined, invert: undefined }
    ])
  })

  it('get_scan answers every unit id asked, lowest first, with what each type gave back', () => {
    const blank = { coils: '', discrete_inputs: '', input_registers: '', holding_registers: '' }
    const result = (
      id: number,
      registerTypes: ScanUnitIDResult['registerTypes'],
      errorMessage: Partial<ScanUnitIDResult['errorMessage']> = {}
    ): ScanUnitIDResult => ({
      id,
      registerTypes,
      refusedRegisterTypes: [],
      requestedRegisterTypes: ['coils', 'holding_registers'],
      errorMessage: { ...blank, ...errorMessage }
    })
    const live = liveOf({
      clientState: { ...defaultClientState, connectState: 'connected', scanningUnitIds: true },
      scanProgress: 40,
      // The store keeps the newest first.
      scanUnitIdResults: [
        result(9, [], { coils: 'Timed out', holding_registers: 'Timed out' }),
        result(7, ['holding_registers'], { coils: 'Modbus exception 2: Illegal data address' }),
        result(3, ['coils', 'holding_registers'])
      ]
    })

    expect(getScan(source({ live: { a: live } }), { client: 'a' })).toEqual({
      scanning: 'unit_ids',
      progress: 40,
      unitIds: [
        { unitId: 3, coils: 'data', holding_registers: 'data' },
        {
          unitId: 7,
          coils: 'Modbus exception 2: Illegal data address',
          holding_registers: 'data'
        },
        { unitId: 9, coils: 'Timed out', holding_registers: 'Timed out' }
      ]
    })
  })

  it('get_scan names a register scan, and no scan when none runs', () => {
    const scanning = liveOf({
      clientState: { ...defaultClientState, connectState: 'connected', scanningRegisters: true }
    })
    expect(getScan(source({ live: { a: scanning } }), { client: 'a' })).toMatchObject({
      scanning: 'registers'
    })
    expect(getScan(source({ live: {} }), { client: 'a' })).toEqual({
      scanning: 'none',
      progress: 0,
      unitIds: []
    })
  })

  it('get_scan refuses a client id nobody has', () => {
    expect(() => getScan(source(), { client: 'x' })).toThrow('list_clients')
  })

  it('list_servers names each server, its port and its units', () => {
    expect(listServers(source())).toEqual([
      {
        id: 's',
        name: 'Simulated meter',
        mode: 'tcp',
        littleEndian: false,
        target: 'port 502',
        units: ['1']
      }
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
      littleEndian: false,
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

  // What the server grid shows: a date for a unix register, and a bitmap's
  // sixteen bits with their comments where it expands.
  it('get_unit answers a unix register as its date and a bitmap as its bits', () => {
    const params = {
      registerType: 'holding_registers' as const,
      min: undefined,
      max: undefined,
      interval: undefined
    }
    const clock: PersistedServer = {
      ...simulator,
      littleEndian: true,
      registers: {
        '1': {
          coils: {},
          discrete_inputs: {},
          input_registers: {},
          holding_registers: {
            30: {
              value: 1700000000,
              params: {
                ...params,
                address: 30,
                dataType: 'unix',
                comment: 'clock',
                value: 1700000000
              }
            },
            40: {
              value: 5,
              params: {
                ...params,
                address: 40,
                dataType: 'bitmap',
                comment: 'status',
                value: 5,
                bitMap: { '2': { comment: 'door open' } }
              }
            }
          }
        }
      }
    }
    const answer = getUnit(source({ servers: { s: clock } }), { server: 's', unit: '1' }) as {
      littleEndian: boolean
      registers: { value: unknown; bits?: { bit: number; on: boolean; comment?: string }[] }[]
    }
    expect(answer.littleEndian).toBe(true)
    expect(answer.registers[0]?.value).toBe('2023/11/14 22:13:20')
    expect(answer.registers[1]?.bits?.slice(0, 4)).toEqual([
      { bit: 0, on: true, comment: undefined },
      { bit: 1, on: false, comment: undefined },
      { bit: 2, on: true, comment: 'door open' },
      { bit: 3, on: false, comment: undefined }
    ])
    expect(answer.registers[1]?.bits).toHaveLength(16)
  })

  it('get_unit refuses a unit the server does not host', () => {
    expect(() => getUnit(source(), { server: 's', unit: '2' })).toThrow('has no unit 2')
    expect(() => getUnit(source(), { server: 's', unit: '999' })).toThrow('has no unit 999')
  })

  it('get_unit refuses a server id nobody has', () => {
    expect(() => getUnit(source(), { server: 'x', unit: '1' })).toThrow('list_servers')
  })
})
