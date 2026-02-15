import {
  ServerConfigSchema,
  ServerConfig,
  RegisterParams,
  ServerRegistersPerUnit,
  ServerRegisters
} from './types/server'
import { RegisterMapConfigSchema, RegisterMapConfig, RegisterMapping } from './types/client'

const CURRENT_SERVER_VERSION = 2
const CURRENT_CLIENT_VERSION = 2

export interface MigrationResult<T> {
  config: T
  migrated: boolean
  fromVersion: number
  warning?: 'FUTURE_VERSION' | 'MIXED_ENDIANNESS'
  wasMixedEndianness?: boolean
}

//
// V1 types — describe the old config format for type-safe migration
//

interface V1RegisterParams extends Omit<RegisterParams, never> {
  littleEndian: boolean
}

interface V1ServerRegisterEntry {
  value: number
  params: V1RegisterParams
}

type V1ServerRegister = Record<string, V1ServerRegisterEntry>

interface V1ServerRegisters {
  coils?: Record<string, boolean>
  discrete_inputs?: Record<string, boolean>
  input_registers?: V1ServerRegister
  holding_registers?: V1ServerRegister
}

type V1ServerRegistersPerUnit = Record<string, V1ServerRegisters | undefined>

interface V1ServerConfig {
  name?: string
  serverRegistersPerUnit?: V1ServerRegistersPerUnit
}

interface V1ClientConfig {
  name?: string
  registerMapping?: RegisterMapping
}

//
// Server Config Migration
//

type Migration<T> = (config: unknown) => T

const SERVER_MIGRATIONS: Record<number, Migration<ServerConfig>> = {
  1: migrateServerV1toV2
  // Future: 2: migrateServerV2toV3
}

/**
 * Extract global endianness from v1 server config with per-register endianness.
 * Uses majority voting. In case of tie, defaults to false (Big-Endian, Modbus standard).
 */
function extractGlobalEndianness(serverRegistersPerUnit: V1ServerRegistersPerUnit): {
  endianness: boolean
  wasMixed: boolean
} {
  const counts = { little: 0, big: 0 }

  for (const serverRegisters of Object.values(serverRegistersPerUnit)) {
    if (!serverRegisters) continue

    const registerTypes: Array<'input_registers' | 'holding_registers'> = [
      'input_registers',
      'holding_registers'
    ]
    for (const regType of registerTypes) {
      const registers = serverRegisters[regType]
      if (!registers) continue

      for (const entry of Object.values(registers)) {
        if (!entry?.params) continue
        if (entry.params.littleEndian === true) counts.little++
        else if (entry.params.littleEndian === false) counts.big++
      }
    }
  }

  // No registers found - default to Big-Endian
  if (counts.little === 0 && counts.big === 0) {
    return { endianness: false, wasMixed: false }
  }

  const wasMixed = counts.little > 0 && counts.big > 0
  // In case of tie, default to Big-Endian (Modbus standard)
  const endianness = counts.little > counts.big

  return { endianness, wasMixed }
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

    const migratedServerRegisters: ServerRegisters = {
      coils: serverRegisters.coils ?? {},
      discrete_inputs: serverRegisters.discrete_inputs ?? {},
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
 * Apply legacy string replacements (camelCase to snake_case)
 */
function applyLegacyStringReplacements(content: string): string {
  return content
    .replaceAll('InputRegisters', 'input_registers')
    .replaceAll('DiscreteInputs', 'discrete_inputs')
    .replaceAll('Coils', 'coils')
    .replaceAll('HoldingRegisters', 'holding_registers')
}

/**
 * Migrate server config to current version
 */
export function migrateServerConfig(raw: string): MigrationResult<ServerConfig> {
  // Apply legacy string replacements first
  const cleanedContent = applyLegacyStringReplacements(raw)
  const parsed = JSON.parse(cleanedContent)
  const detectedVersion = parsed.version ?? 1

  // Current version - no migration needed
  if (detectedVersion === CURRENT_SERVER_VERSION) {
    const result = ServerConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Invalid server config v${CURRENT_SERVER_VERSION}: ${result.error.message}`)
    }
    return {
      config: result.data,
      migrated: false,
      fromVersion: CURRENT_SERVER_VERSION
    }
  }

  // Future version
  if (detectedVersion > CURRENT_SERVER_VERSION) {
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

  while (version < CURRENT_SERVER_VERSION) {
    const migrate = SERVER_MIGRATIONS[version]
    if (!migrate) {
      throw new Error(`No migration path from v${version} to v${CURRENT_SERVER_VERSION}`)
    }
    config = migrate(config)
    version++
  }

  // Validate final result
  const result = ServerConfigSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Migration produced invalid config: ${result.error.message}`)
  }

  return {
    config: result.data,
    migrated: true,
    fromVersion: detectedVersion,
    warning: config.wasMixedEndianness ? 'MIXED_ENDIANNESS' : undefined,
    wasMixedEndianness: config.wasMixedEndianness
  }
}

//
// Client Config Migration
//

const CLIENT_MIGRATIONS: Record<number, Migration<RegisterMapConfig>> = {
  1: migrateClientV1toV2
  // Future: 2: migrateClientV2toV3
}

/**
 * Migrate client config from v1 to v2.
 * - Adds version and modbuxVersion fields
 */
function migrateClientV1toV2(v1Config: unknown): RegisterMapConfig {
  const config = v1Config as V1ClientConfig
  return {
    version: 2,
    modbuxVersion: '1.5.0',
    name: config.name,
    registerMapping: config.registerMapping ?? (v1Config as RegisterMapping)
  }
}

/**
 * Migrate client config to current version
 */
export function migrateClientConfig(raw: string): MigrationResult<RegisterMapConfig> {
  // Apply legacy string replacements first
  const cleanedContent = applyLegacyStringReplacements(raw)
  const parsed = JSON.parse(cleanedContent)
  const detectedVersion = parsed.version ?? 1

  // Current version - no migration needed
  if (detectedVersion === CURRENT_CLIENT_VERSION) {
    const result = RegisterMapConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(`Invalid client config v${CURRENT_CLIENT_VERSION}: ${result.error.message}`)
    }
    return {
      config: result.data,
      migrated: false,
      fromVersion: CURRENT_CLIENT_VERSION
    }
  }

  // Future version
  if (detectedVersion > CURRENT_CLIENT_VERSION) {
    return {
      config: parsed as RegisterMapConfig,
      migrated: false,
      fromVersion: detectedVersion,
      warning: 'FUTURE_VERSION'
    }
  }

  // Old version - apply sequential migrations
  let config = parsed
  let version = detectedVersion

  while (version < CURRENT_CLIENT_VERSION) {
    const migrate = CLIENT_MIGRATIONS[version]
    if (!migrate) {
      throw new Error(`No migration path from v${version} to v${CURRENT_CLIENT_VERSION}`)
    }
    config = migrate(config)
    version++
  }

  // Validate final result
  const result = RegisterMapConfigSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Migration produced invalid config: ${result.error.message}`)
  }

  return {
    config: result.data,
    migrated: true,
    fromVersion: detectedVersion
  }
}

//
// LocalStorage / Zustand State Migration
//

interface V1ZustandServerState {
  serverRegisters?: Record<string, V1ServerRegistersPerUnit | undefined>
  littleEndian?: Record<string, boolean>
}

/**
 * Migrate server Zustand state from v1 (littleEndian per register) to v2 (global littleEndian).
 * Used by Zustand persist middleware.
 */
export function migrateServerRegistersState(
  oldState: Record<string, unknown>
): Record<string, unknown> {
  const migrated = { ...oldState } as Record<string, unknown> & V1ZustandServerState

  // Add littleEndian field per uuid if it doesn't exist
  if (!migrated.littleEndian) {
    migrated.littleEndian = {}
  }

  const serverRegisters = migrated.serverRegisters ?? {}

  // Migrate each server's registers
  for (const [uuid, serverPerUnit] of Object.entries(serverRegisters)) {
    if (!serverPerUnit) continue

    // Extract global endianness from all registers across all units
    const { endianness, wasMixed } = extractGlobalEndianness(serverPerUnit)

    // Set global littleEndian for this server uuid
    migrated.littleEndian[uuid] = endianness

    // Remove littleEndian from all register params
    for (const serverRegisters of Object.values(serverPerUnit)) {
      if (!serverRegisters) continue

      const registerTypes: Array<'input_registers' | 'holding_registers'> = [
        'input_registers',
        'holding_registers'
      ]
      for (const regType of registerTypes) {
        const registers = serverRegisters[regType]
        if (!registers) continue

        for (const entry of Object.values(registers)) {
          if (!entry?.params) continue
          // Remove littleEndian in-place (mutating is intentional for localStorage migration)
          delete (entry.params as Partial<V1RegisterParams>).littleEndian
        }
      }
    }

    if (wasMixed && import.meta.env.DEV) {
      console.warn(`Server ${uuid}: Mixed endianness detected during localStorage migration`)
    }
  }

  return migrated
}
