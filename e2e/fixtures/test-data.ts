/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RegisterDef, BoolDef, ServerConfig } from './types'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Single source of truth: JSON config files
const CONFIG_DIR = resolve(__dirname, './config-files')

function loadJson(filename: string): any {
  return JSON.parse(readFileSync(resolve(CONFIG_DIR, filename), 'utf-8'))
}

interface JsonConfig {
  name: string
  serverRegistersPerUnit: Record<
    string,
    {
      coils: Record<string, boolean>
      discrete_inputs: Record<string, boolean>
      holding_registers: Record<string, { value: number; params: any }>
      input_registers: Record<string, { value: number; params: any }>
    }
  >
}

/** Map dataType string to the correct RegisterDef mode */
function toRegisterDef(params: any): RegisterDef {
  const dataType = params.dataType.toUpperCase() as string
  const base = {
    registerType: params.registerType,
    address: params.address
  }

  // UTF-8 fixed
  if (dataType === 'UTF-8' || dataType === 'UTF8') {
    return {
      ...base,
      dataType: 'UTF-8',
      mode: 'fixed-utf8',
      stringValue: params.stringValue ?? '',
      length: params.length ?? 10,
      comment: params.comment
    }
  }

  // Generator (has interval — config stores ms, UI expects seconds)
  if (params.interval !== undefined) {
    const intervalSeconds = String(params.interval / 1000)
    if (dataType === 'DATETIME' || dataType === 'UNIX') {
      return {
        ...base,
        dataType,
        mode: 'generator-datetime',
        interval: intervalSeconds,
        comment: params.comment
      }
    }
    return {
      ...base,
      dataType,
      mode: 'generator',
      min: String(params.min),
      max: String(params.max),
      interval: intervalSeconds,
      comment: params.comment
    }
  }

  // Fixed datetime (unix/datetime without interval)
  if (dataType === 'DATETIME' || dataType === 'UNIX') {
    return { ...base, dataType, mode: 'fixed-datetime', comment: params.comment }
  }

  // Fixed numeric
  return { ...base, dataType, mode: 'fixed', value: String(params.value), comment: params.comment }
}

/** Parse a JSON server config into a ServerConfig for a specific unitId */
export function parseServerConfig(config: JsonConfig, unitId: string, port?: number): ServerConfig {
  const unitData = config.serverRegistersPerUnit[unitId]
  if (!unitData) throw new Error(`Unit ${unitId} not found in config`)

  const registers: RegisterDef[] = []
  for (const regType of ['holding_registers', 'input_registers'] as const) {
    const entries = Object.values(unitData[regType])
    entries.forEach((entry, i) => {
      const def = toRegisterDef(entry.params)
      if (i < entries.length - 1) def.next = true
      registers.push(def)
    })
  }

  const bools: BoolDef[] = []
  for (const boolType of ['coils', 'discrete_inputs'] as const) {
    for (const [addr, state] of Object.entries(unitData[boolType])) {
      bools.push({ registerType: boolType, address: Number(addr), state })
    }
  }

  return { port: port ?? 502, name: config.name, unitId, registers, bools }
}

// Server 1 (port 502) — all data types + generators
const server1Config = loadJson('server-integration.json') as JsonConfig
export const SERVER_1_UNIT_0 = parseServerConfig(server1Config, '0', 502)
export const SERVER_1_UNIT_1 = parseServerConfig(server1Config, '1')

// Server 2 (auto port) — minimal config with generator
const server2Config = loadJson('server-2.json') as JsonConfig
export const SERVER_2_UNIT_0 = parseServerConfig(server2Config, '0')
