import {
  McpToolArgs,
  RegisterMapObject,
  RegisterType,
  UnitIdStringSchema,
  defaultClientState,
  RegisterData,
  registerWidth,
  wordOf
} from '@shared'
import { getConvertedValue } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import type { PersistedClient } from '@renderer/context/client.zustand.types'
import type { ClientData } from '@renderer/context/live.zustand.types'
import type { PersistedServer } from '@renderer/context/server.zustand.types'

/** A mistake in what the assistant asked, answered to it as the tool's error. */
export class McpToolError extends Error {}

/** What the read tools look at: the persisted halves of the three stores. */
export interface ReadSource {
  clients: Record<string, PersistedClient>
  live: Record<string, ClientData>
  servers: Record<string, PersistedServer>
  serverMode: 'tcp' | 'rtu'
  serialCom: string | undefined
}

const clientOf = (source: ReadSource, id: string): PersistedClient => {
  const client = source.clients[id]
  if (!client) throw new McpToolError(`No client has the id ${id}; list_clients names them`)
  return client
}

const serverOf = (source: ReadSource, id: string): PersistedServer => {
  const server = source.servers[id]
  if (!server) throw new McpToolError(`No server has the id ${id}; list_servers names them`)
  return server
}

const stateOf = (source: ReadSource, id: string): ClientData['clientState'] =>
  source.live[id]?.clientState ?? defaultClientState

/** Where a client connects, the way its toolbar shows it. */
const targetOf = ({ connectionConfig }: PersistedClient): string =>
  connectionConfig.protocol === 'ModbusRtu'
    ? connectionConfig.rtu.com
    : `${connectionConfig.tcp.host}:${connectionConfig.tcp.options.port}`

const REGISTER_TYPES: RegisterType[] = [
  'coils',
  'discrete_inputs',
  'input_registers',
  'holding_registers'
]

export const listClients = (source: ReadSource): unknown =>
  Object.entries(source.clients).map(([id, client]) => {
    const state = stateOf(source, id)
    return {
      id,
      name: client.name,
      protocol: client.connectionConfig.protocol,
      target: targetOf(client),
      unitId: client.connectionConfig.unitId,
      connectState: state.connectState,
      polling: state.polling,
      offline: state.offline
    }
  })

export const getClient = (source: ReadSource, { client }: McpToolArgs<'get_client'>): unknown => {
  const found = clientOf(source, client)
  return {
    id: client,
    name: found.name,
    connectionConfig: found.connectionConfig,
    registerConfig: found.registerConfig,
    state: stateOf(source, client)
  }
}

export const listRegisters = (
  source: ReadSource,
  { client }: McpToolArgs<'list_registers'>
): unknown => {
  const { registerMapping } = clientOf(source, client)
  return REGISTER_TYPES.flatMap((type) =>
    Object.entries(registerMapping[type]).flatMap(([address, entry]) =>
      entry
        ? [
            {
              type,
              address: Number(address),
              name: entry.comment ?? '',
              dataType: entry.dataType,
              scalingFactor: entry.scalingFactor,
              bitMap: entry.bitMap
            }
          ]
        : []
    )
  )
}

/**
 * How many rows the register at `address` spans. A string runs to the next
 * mapped register, as the grid slices it; every other type is its width.
 */
const spanOf = (mapping: RegisterMapObject, address: number, present: Set<number>): number => {
  const dataType = mapping[address]?.dataType
  if (!dataType || dataType === 'none') return 0
  if (dataType !== 'utf8') return registerWidth(dataType)
  let span = 1
  while (present.has(address + span)) {
    const next = mapping[address + span]?.dataType
    if (next && next !== 'none') break
    span++
  }
  return span
}

export const readValues = (source: ReadSource, { client }: McpToolArgs<'read_values'>): unknown => {
  const { registerMapping, registerConfig } = clientOf(source, client)
  const type = registerConfig.type
  const mapping = registerMapping[type]
  const live = source.live[client]
  const rows = live?.registerData ?? []
  const answeredAt = live?.lastSuccessfulTransactionMillis ?? null
  const hexAt = new Map(rows.map((row) => [row.id, row.hex]))
  const present = new Set(hexAt.keys())
  /** Every word the register at `address` spans, in address order, as read. */
  const wordsAt = (address: number): string[] | undefined => {
    const span = spanOf(mapping, address, present)
    if (span === 0) return undefined
    return Array.from({ length: span }, (_, i) => hexAt.get(address + i) ?? '')
  }
  /**
   * The value a row's words make, or none when a word was not read.
   *
   * A string is cut to the rows it spans here rather than by the grid, which
   * cuts by the address groups of the client on screen, not of this one.
   */
  const valueOf = (row: RegisterData, words: string[] | undefined): unknown => {
    if (words?.includes('')) return undefined
    if (mapping[row.id]?.dataType !== 'utf8') return getConvertedValue(row, mapping, false)
    const text = wordOf(row.words, 'utf8')
    return text === undefined || words === undefined
      ? undefined
      : String(text).slice(0, words.length * 2)
  }
  return {
    type,
    littleEndian: registerConfig.littleEndian,
    lastAnswerAt: answeredAt === null ? null : new Date(answeredAt).toISOString(),
    rows: rows.map((row) => {
      const words = wordsAt(row.id)
      return {
        address: row.id,
        name: mapping[row.id]?.comment ?? '',
        dataType: mapping[row.id]?.dataType,
        hex: row.hex,
        words,
        scalingFactor: mapping[row.id]?.scalingFactor,
        value: type === 'coils' || type === 'discrete_inputs' ? row.bit : valueOf(row, words),
        error: row.error
      }
    })
  }
}

export const listServers = (source: ReadSource): unknown =>
  Object.entries(source.servers).map(([id, server]) => ({
    id,
    name: server.name ?? '',
    mode: source.serverMode,
    target: source.serverMode === 'rtu' ? (source.serialCom ?? '') : `port ${server.port}`,
    units: Object.keys(server.registers)
  }))

export const getUnit = (source: ReadSource, { server, unit }: McpToolArgs<'get_unit'>): unknown => {
  const found = serverOf(source, server)
  const unitId = UnitIdStringSchema.safeParse(unit)
  const registers = unitId.success ? found.registers[unitId.data] : undefined
  if (!registers) throw new McpToolError(`Server ${server} has no unit ${unit}`)
  const bools = (['coils', 'discrete_inputs'] as const).flatMap((type) =>
    Object.entries(registers[type]).map(([address, entry]) => ({
      type,
      address: Number(address),
      name: entry.comment ?? '',
      value: entry.value
    }))
  )
  const numbers = (['input_registers', 'holding_registers'] as const).flatMap((type) =>
    Object.entries(registers[type]).map(([address, { value, params }]) => ({
      type,
      address: Number(address),
      name: params.comment,
      dataType: params.dataType,
      value: params.dataType === 'utf8' ? params.stringValue : value,
      generator:
        params.interval !== undefined
          ? { min: params.min, max: params.max, interval: params.interval }
          : undefined
    }))
  )
  return { server, unit, registers: [...bools, ...numbers] }
}
