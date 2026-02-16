import {
  ServerConfigSchema,
  ServerConfig,
  RegisterParams,
  ServerRegistersPerUnit,
  ServerRegisters
} from '../../types/server'
import { MigrationResult, Migration } from '../types'
import { applyLegacyStringReplacements } from '../shared'
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
 * Migrate server config to current version
 */
export function migrateServerConfig(raw: string): MigrationResult<ServerConfig> {
  // Apply legacy string replacements first
  const cleanedContent = applyLegacyStringReplacements(raw)
  const parsed = JSON.parse(cleanedContent)
  const detectedVersion = parsed.version ?? 1

  // Current version - no migration needed
  if (detectedVersion === CURRENT_SERVER_CONFIG_VERSION) {
    const result = ServerConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Invalid server config v${CURRENT_SERVER_CONFIG_VERSION}: ${result.error.message}`
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
