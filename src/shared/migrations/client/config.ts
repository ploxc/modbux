import { ClientDeviceConfigSchema, ClientDeviceConfig, RegisterMapping } from '../../types/client'
import { emptyRegisterMapping } from '../../default'
import { repairPersisted } from '../../repairPersisted'
import { MigrationResult, Migration } from '../types'
import {
  dropUnreadableConfigMapping,
  formatZodError,
  parseConfigFile,
  refuseOtherSidesConfig,
  renameLegacyRegisterTypeKeys
} from '../shared'

/**
 * The version the Save button writes into a client config file.
 *
 * A migration step keeps its own target as a literal rather than reading this:
 * the loop below counts the steps and this number only says where to stop, so
 * v1 to v2 writes 2 whatever this becomes.
 */
export const CURRENT_CLIENT_CONFIG_VERSION = 3

interface V1ClientConfig {
  name?: string
  registerMapping?: RegisterMapping
}

const CLIENT_CONFIG_MIGRATIONS: Record<number, Migration<Record<string, unknown>>> = {
  1: migrateClientV1toV2,
  2: migrateClientV2toV3
}

/**
 * Migrate client config from v1 to v2.
 * - Renames the camelCase register type keys
 * - Adds version and modbuxVersion fields
 */
function migrateClientV1toV2(v1Config: unknown): Record<string, unknown> {
  renameLegacyRegisterTypeKeys(v1Config)
  const config = v1Config as V1ClientConfig
  return {
    version: 2,
    modbuxVersion: '2.0.0',
    name: config.name,
    littleEndian: false,
    registerMapping: config.registerMapping ?? (v1Config as RegisterMapping)
  }
}

/**
 * Migrate client config from v2 to v3: the file names its kind, one device.
 * A version 2 file carries no unit id, and gets none.
 */
function migrateClientV2toV3(v2Config: unknown): Record<string, unknown> {
  return { ...(v2Config as object), kind: 'client-device', version: 3 }
}

/**
 * Migrate client config to current version
 */
export function migrateClientConfig(raw: string): MigrationResult<ClientDeviceConfig> {
  const { parsed, detectedVersion } = parseConfigFile(raw)
  refuseOtherSidesConfig(parsed, 'client')

  // Current version - no migration needed
  if (detectedVersion === CURRENT_CLIENT_CONFIG_VERSION) {
    const result = ClientDeviceConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Invalid client config v${CURRENT_CLIENT_CONFIG_VERSION}: ${formatZodError(result.error)}`
      )
    }
    return {
      config: result.data,
      migrated: false,
      fromVersion: CURRENT_CLIENT_CONFIG_VERSION
    }
  }

  // A config from a newer Modbux keeps the fields it still shares with this
  // one. It is repaired rather than cast: `LoadButton` calls
  // `replaceRegisterMapping(config.registerMapping)` with no gate at all, so
  // `{ version: 9, registerMapping: 'nope' }` would reach the persisted store
  // and main. The same answer a persisted store gets, and `reset` is what the
  // warning says.
  if (detectedVersion > CURRENT_CLIENT_CONFIG_VERSION) {
    // Entry by entry first. `registerMapping` is one field, and it is the one
    // thing in the client store built by hand, so one address this version
    // cannot read would cost the whole mapping.
    dropUnreadableConfigMapping(parsed)
    // A newer file that names no kind is still a client file: the side was
    // checked above, and the one kind a client file has is a device.
    parsed.kind ??= 'client-device'

    const repair = repairPersisted(
      ClientDeviceConfigSchema,
      parsed,
      {
        kind: 'client-device',
        version: detectedVersion,
        modbuxVersion: '',
        name: undefined,
        littleEndian: false,
        registerMapping: emptyRegisterMapping()
      } satisfies ClientDeviceConfig,
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

  while (version < CURRENT_CLIENT_CONFIG_VERSION) {
    const migrate = CLIENT_CONFIG_MIGRATIONS[version]
    if (!migrate) {
      throw new Error(`No migration path from v${version} to v${CURRENT_CLIENT_CONFIG_VERSION}`)
    }
    config = migrate(config)
    version++
  }

  // Validate final result
  const result = ClientDeviceConfigSchema.safeParse(config)
  if (!result.success) {
    throw new Error(`Migration produced invalid config: ${formatZodError(result.error)}`)
  }

  return {
    config: result.data,
    migrated: true,
    fromVersion: detectedVersion
  }
}
