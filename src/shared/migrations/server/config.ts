import {
  ServerConfigSchema,
  ServerConfig,
  RegisterParams,
  ServerRegistersPerUnit,
  ServerRegisters
} from '../../types/server'
import { MigrationResult, Migration } from '../types'
import {
  formatZodError,
  migrateBoolShapeForUnit,
  objectValues,
  dropUnservableConfigRegisters,
  isRecord,
  parseConfigFile,
  renameLegacyRegisterTypeKeys,
  stringifyExact64BitValues
} from '../shared'
import { V1ServerConfig, V1ServerRegisters, extractGlobalEndianness } from './v1'
import { repairPersisted } from '../../repairPersisted'

/**
 * The version the Save button writes into a server config file.
 *
 * A migration step keeps its own target as a literal rather than reading this:
 * the loop below counts the steps and this number only says where to stop, so
 * v1 to v2 writes 2 whatever this becomes.
 */
export const CURRENT_SERVER_CONFIG_VERSION = 3

const SERVER_CONFIG_MIGRATIONS: Record<number, Migration<ServerConfig>> = {
  1: migrateServerV1toV2,
  2: migrateServerV2toV3
  // Future: 3: migrateServerV3toV4
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
  // `V1ServerRegisters` declares the bool records as the entries this leaves,
  // because the loop below reads them after it. The helper runs here rather
  // than a third copy of the step: a copy that builds a new record per bool
  // type turns a `coils` holding a number into an empty one and passes it,
  // where the helper leaves the number for `ServerConfigSchema` to refuse.
  migrateBoolShapeInConfig(v1Registers)
  const { endianness, wasMixed } = extractGlobalEndianness(v1Registers)

  const migratedRegisters: ServerRegistersPerUnit = {}

  // Each unit is read as `unknown` and named after the check, because the V1
  // types describe a file that parsed rather than one that was validated.
  for (const [unitId, unit] of Object.entries<unknown>(v1Registers)) {
    if (unit === undefined) continue

    // A unit that is not an object read `coils` off itself, got `undefined` and
    // loaded as an empty unit, which is the half-open door the bool records had
    // one level down. `serverRegistersPerUnit` holding the string 'ab' opened
    // two of them, keyed 0 and 1. It reaches the final `safeParse` whole now.
    if (!isRecord(unit)) {
      migratedRegisters[unitId] = unit as ServerRegisters
      continue
    }
    const serverRegisters = unit as V1ServerRegisters

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
 * Migrate server config from v2 to v3: a 64 bit value is a decimal string.
 *
 * The three types whose composite fills 64 bits as an integer held a number,
 * and a number carries 53 bits. The version moves because the file shape moved:
 * without it a config this build writes still claims v2, and v2.3.0 takes the
 * `detectedVersion === CURRENT` branch, fails `ServerConfigSchema` on
 * `z.number()`, and refuses the whole file rather than the one register.
 *
 * `stringifyExact64BitValues` walks a persisted store,
 * `servers[uuid].registers`, and a config holds the units alone, so the blob is
 * wrapped in the shape that helper reads. That is the same difference
 * `migrateBoolShapeForUnit` carries.
 *
 * The bool shape goes with it. `migrateBoolShapeInConfig` ran on the
 * `detectedVersion === CURRENT` branch alone, and a v2 file carrying the old
 * `boolean` entries now takes this step instead of that branch.
 */
function migrateServerV2toV3(v2Config: unknown): ServerConfig {
  const config = v2Config as ServerConfig & Record<string, unknown>
  migrateBoolShapeInConfig(config.serverRegistersPerUnit)
  stringifyExact64BitValues({ servers: { config: { registers: config.serverRegistersPerUnit } } })
  return { ...config, version: 3 }
}

/**
 * Convert old `boolean` bool entries to `{ value: boolean }` across every unit
 * of a parsed config. Mutates in place. Safe to call on already-migrated data.
 */
function migrateBoolShapeInConfig(serverRegistersPerUnit: unknown): void {
  for (const unitRegisters of objectValues(serverRegistersPerUnit)) {
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
    migrateBoolShapeInConfig(parsed.serverRegistersPerUnit)
    // A file this version writes carries a decimal string for a 64 bit value,
    // and a hand-edited one can carry the number: `ServerConfigSchema` takes
    // either. The persisted store's own step is gated on the store version and
    // does not run on a config load, so without this the first single word
    // write after opening such a file folds from the rounded value, which is
    // the defect the v2 to v3 step removes for a v2 file.
    stringifyExact64BitValues({ servers: { config: { registers: parsed.serverRegistersPerUnit } } })
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
    // Register by register first, because `repairPersisted` reads a field
    // whole and `serverRegistersPerUnit` is the one field a server config is
    // about: one register with a data type this version does not name would
    // cost every register on every unit.
    dropUnservableConfigRegisters(parsed)

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
      futureVersion: repair.reset
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
