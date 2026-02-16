import { RegisterMapConfigSchema, RegisterMapConfig, RegisterMapping } from '../../types/client'
import { MigrationResult, Migration } from '../types'
import { applyLegacyStringReplacements } from '../shared'

export const CURRENT_CLIENT_CONFIG_VERSION = 2

interface V1ClientConfig {
  name?: string
  registerMapping?: RegisterMapping
}

const CLIENT_CONFIG_MIGRATIONS: Record<number, Migration<RegisterMapConfig>> = {
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
  if (detectedVersion === CURRENT_CLIENT_CONFIG_VERSION) {
    const result = RegisterMapConfigSchema.safeParse(parsed)
    if (!result.success) {
      throw new Error(
        `Invalid client config v${CURRENT_CLIENT_CONFIG_VERSION}: ${result.error.message}`
      )
    }
    return {
      config: result.data,
      migrated: false,
      fromVersion: CURRENT_CLIENT_CONFIG_VERSION
    }
  }

  // Future version
  if (detectedVersion > CURRENT_CLIENT_CONFIG_VERSION) {
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

  while (version < CURRENT_CLIENT_CONFIG_VERSION) {
    const migrate = CLIENT_CONFIG_MIGRATIONS[version]
    if (!migrate) {
      throw new Error(`No migration path from v${version} to v${CURRENT_CLIENT_CONFIG_VERSION}`)
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
