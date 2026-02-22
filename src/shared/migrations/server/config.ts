import {
  ServerConfigSchema,
  ServerConfig,
  ServerBoolEntry,
  RegisterParams,
  ServerRegistersPerUnit,
  ServerRegisters
} from '../../types/server'
import { MigrationResult, Migration } from '../types'
import { applyLegacyStringReplacements, formatZodError } from '../shared'
import { V1ServerConfig, extractGlobalEndianness } from './shared'

export const CURRENT_SERVER_CONFIG_VERSION = 2

const SERVER_CONFIG_MIGRATIONS: Record<number, Migration<ServerConfig>> = {
  1: migrateServerV1toV2
  // Future: 2: migrateServerV2toV3
}

/**
 * Migrate server config from v1 to v2.
 * - Adds version and modbuxVersion fields
 * - Extracts global littleEndian from per-register settings
 * - Removes littleEndian from individual register params
 */
function migrateServerV1toV2(v1Config: unknown): ServerConfig & { wasMixedEndianness?: boolean } {
  const config = v1Config as V1ServerConfig
  const v1Registers = config.serverRegistersPerUnit ?? {}
  const { endianness, wasMixed } = extractGlobalEndianness(v1Registers)

  const migratedRegisters: ServerRegistersPerUnit = {}

  for (const [unitId, serverRegisters] of Object.entries(v1Registers)) {
    if (!serverRegisters) continue

    // Convert old boolean shape to { value: boolean } entries
    const migratedCoils: Record<string, ServerBoolEntry> = {}
    for (const [addr, val] of Object.entries(serverRegisters.coils ?? {})) {
      migratedCoils[addr] =
        typeof val === 'boolean' ? { value: val } : (val as ServerBoolEntry)
    }
    const migratedDiscreteInputs: Record<string, ServerBoolEntry> = {}
    for (const [addr, val] of Object.entries(serverRegisters.discrete_inputs ?? {})) {
      migratedDiscreteInputs[addr] =
        typeof val === 'boolean' ? { value: val } : (val as ServerBoolEntry)
    }

    const migratedServerRegisters: ServerRegisters = {
      coils: migratedCoils,
      discrete_inputs: migratedDiscreteInputs,
      input_registers: {},
      holding_registers: {}
    }

    const registerTypes: Array<'input_registers' | 'holding_registers'> = [
      'input_registers',
      'holding_registers'
    ]
    for (const regType of registerTypes) {
      const registers = serverRegisters[regType]
      if (!registers) continue

      for (const [address, entry] of Object.entries(registers)) {
        if (!entry?.params) continue

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { littleEndian, ...paramsWithoutEndian } = entry.params

        migratedServerRegisters[regType][address] = {
          value: entry.value,
          params: paramsWithoutEndian as RegisterParams
        }
      }
    }

    migratedRegisters[unitId] = migratedServerRegisters
  }

  const v2Config: ServerConfig & { wasMixedEndianness?: boolean } = {
    version: 2,
    modbuxVersion: '1.5.0',
    name: config.name ?? '',
    littleEndian: endianness,
    serverRegistersPerUnit: migratedRegisters
  }

  if (wasMixed) {
    v2Config.wasMixedEndianness = true
  }

  return v2Config
}

/**
 * Convert old `boolean` bool entries to `{ value: boolean }` in a parsed config object.
 * Mutates in place. Safe to call on already-migrated data.
 */
function migrateBoolShapeInConfig(config: Record<string, unknown>): void {
  const spu = config.serverRegistersPerUnit as
    | Record<string, Record<string, unknown> | undefined>
    | undefined
  if (!spu) return

  for (const unitRegisters of Object.values(spu)) {
    if (!unitRegisters || typeof unitRegisters !== 'object') continue

    for (const boolType of ['coils', 'discrete_inputs'] as const) {
      const boolRecord = unitRegisters[boolType]
      if (!boolRecord || typeof boolRecord !== 'object') continue

      for (const [addr, entry] of Object.entries(boolRecord as Record<string, unknown>)) {
        if (typeof entry === 'boolean') {
          ;(boolRecord as Record<string, unknown>)[addr] = { value: entry }
        }
      }
    }
  }
}

/**
 * Migrate server config to current version
 */
export function migrateServerConfig(raw: string): MigrationResult<ServerConfig> {
  // Apply legacy string replacements first
  const cleanedContent = applyLegacyStringReplacements(raw)
  const parsed = JSON.parse(cleanedContent)
  const detectedVersion = parsed.version ?? 1

  // Current version - migrate bool shape if needed, then validate
  if (detectedVersion === CURRENT_SERVER_CONFIG_VERSION) {
    migrateBoolShapeInConfig(parsed)
    const result = ServerConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Invalid server config v${CURRENT_SERVER_CONFIG_VERSION}: ${formatZodError(result.error)}`
      )
    }
    return {
      config: result.data,
      migrated: false,
      fromVersion: CURRENT_SERVER_CONFIG_VERSION
    }
  }

  // Future version
  if (detectedVersion > CURRENT_SERVER_CONFIG_VERSION) {
    return {
      config: parsed as ServerConfig,
      migrated: false,
      fromVersion: detectedVersion,
      warning: 'FUTURE_VERSION'
    }
  }

  // Old version - apply sequential migrations
  let config = parsed
  let version = detectedVersion

  while (version < CURRENT_SERVER_CONFIG_VERSION) {
    const migrate = SERVER_CONFIG_MIGRATIONS[version]
    if (!migrate) {
      throw new Error(`No migration path from v${version} to v${CURRENT_SERVER_CONFIG_VERSION}`)
    }
    config = migrate(config)
    version++
  }

  // Validate final result
  const result = ServerConfigSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Migration produced invalid config: ${formatZodError(result.error)}`)
  }

  return {
    config: result.data,
    migrated: true,
    fromVersion: detectedVersion,
    warning: config.wasMixedEndianness ? 'MIXED_ENDIANNESS' : undefined,
    wasMixedEndianness: config.wasMixedEndianness
  }
}
