export interface MigrationResult<T> {
  config: T
  migrated: boolean
  fromVersion: number
  warning?: 'FUTURE_VERSION' | 'MIXED_ENDIANNESS'
  wasMixedEndianness?: boolean
}

export type Migration<T> = (config: unknown) => T
