import {
  ServerConfigSchema,
  ServerConfig,
  ServerBoolEntry,
  RegisterParams,
  ServerRegistersPerUnit,
  ServerRegisters
} from '../../types/server'
import { MigrationResult, Migration } from '../types'
import {
  formatZodError,
  migrateBoolShapeForUnit,
  objectValues,
  parseConfigFile,
  renameLegacyRegisterTypeKeys
} from '../shared'
import { V1ServerConfig, extractGlobalEndianness } from './shared'
import { repairPersisted } from '../../repairPersisted'

/**
 * The version the Save button writes into a server config file.
 *
 * A migration step keeps its own target as a literal rather than reading this:
 * the loop below counts the steps and this number only says where to stop, so
 * v1 to v2 writes 2 whatever this becomes.
 */
export const CURRENT_SERVER_CONFIG_VERSION = 2

const SERVER_CONFIG_MIGRATIONS: Record<number, Migration<ServerConfig>> = {
  1: migrateServerV1toV2
  // Future: 2: migrateServerV2toV3
}

/**
 * Migrate server config from v1 to v2.
 * - Renames the camelCase register type keys
 * - Adds version and modbuxVersion fields
 * - Extracts global littleEndian from per-register settings
 * - Removes littleEndian from individual register params
 */
function migrateServerV1toV2(v1Config: unknown): ServerConfig & { wasMixedEndianness?: boolean } {
  renameLegacyRegisterTypeKeys(v1Config)
  const config = v1Config as V1ServerConfig
  const v1Registers = config.serverRegistersPerUnit ?? {}
  const { endianness, wasMixed } = extractGlobalEndianness(v1Registers)

  const migratedRegisters: ServerRegistersPerUnit = {}

  for (const [unitId, serverRegisters] of Object.entries(v1Registers)) {
    if (!serverRegisters) continue

    // Convert old boolean shape to { value: boolean } entries
    const migratedCoils: Record<string, ServerBoolEntry> = {}
    for (const [address, value] of Object.entries(serverRegisters.coils ?? {})) {
      migratedCoils[address] = typeof value === 'boolean' ? { value } : (value as ServerBoolEntry)
    }
    const migratedDiscreteInputs: Record<string, ServerBoolEntry> = {}
    for (const [address, value] of Object.entries(serverRegisters.discrete_inputs ?? {})) {
      migratedDiscreteInputs[address] =
        typeof value === 'boolean' ? { value } : (value as ServerBoolEntry)
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
    modbuxVersion: '2.0.0',
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
 * Convert old `boolean` bool entries to `{ value: boolean }` in a parsed config
 * object. Mutates in place. Safe to call on already-migrated data.
 */
function migrateBoolShapeInConfig(config: Record<string, unknown>): void {
  for (const unitRegisters of objectValues(config.serverRegistersPerUnit)) {
    migrateBoolShapeForUnit(unitRegisters)
  }
}

/**
 * Migrate server config to current version
 */
export function migrateServerConfig(raw: string): MigrationResult<ServerConfig> {
  const { parsed, detectedVersion } = parseConfigFile(raw)

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

  // A config from a newer Modbux keeps the fields it still shares with this
  // one. The branch cast the parsed JSON straight to `ServerConfig` and
  // returned it, so `{ version: 9, serverRegistersPerUnit: 'not a unit' }` went
  // into the store with the snackbar reading "Some features may not work
  // correctly", which is a compatibility notice for something no schema had
  // looked at. `repairPersisted` is the same answer a persisted store already
  // gets, and `reset` is what the warning now says.
  if (detectedVersion > CURRENT_SERVER_CONFIG_VERSION) {
    const repair = repairPersisted(
      ServerConfigSchema,
      parsed,
      {
        version: detectedVersion,
        modbuxVersion: '',
        name: '',
        littleEndian: false,
        serverRegistersPerUnit: {}
      } satisfies ServerConfig,
      true
    )

    return {
      config: repair.state,
      migrated: false,
      fromVersion: detectedVersion,
      warning: 'FUTURE_VERSION',
      reset: repair.reset
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

  // `migrateServerV1toV2` sets this flag, and `parseConfigFile` types the blob
  // it reads as a record of `unknown` rather than the `any` `JSON.parse` gave,
  // so the flag has to be read as the boolean it is.
  const wasMixedEndianness = config.wasMixedEndianness === true

  return {
    config: result.data,
    migrated: true,
    fromVersion: detectedVersion,
    warning: wasMixedEndianness ? 'MIXED_ENDIANNESS' : undefined,
    wasMixedEndianness
  }
}
