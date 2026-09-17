import type { ConfigReset } from '../repairPersisted'

export interface MigrationResult<T> {
  config: T
  migrated: boolean
  fromVersion: number
  warning?: 'FUTURE_VERSION' | 'MIXED_ENDIANNESS'
  wasMixedEndianness?: boolean
  /**
   * What a config from a newer Modbux did not bring across, and undefined when
   * it brought everything.
   *
   * Set on the `FUTURE_VERSION` path alone. That branch used to cast the parsed
   * JSON straight to the config type, so it was the one door into the app no
   * schema stood in, and the warning the user read was a compatibility notice
   * for something that had not been checked at all.
   */
  reset?: ConfigReset
}

export type Migration<T> = (config: unknown) => T
