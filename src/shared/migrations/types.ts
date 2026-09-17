import type { ConfigReset } from '../repairPersisted'

export interface MigrationResult<T> {
  config: T
  migrated: boolean
  fromVersion: number
  warning?: 'MIXED_ENDIANNESS'
  wasMixedEndianness?: boolean
  /**
   * Set when the file claims a version newer than this Modbux writes, and says
   * what it did not bring across.
   *
   * One field rather than a `warning` of `'FUTURE_VERSION'` beside a `reset`
   * that is only ever set with it: the pair made the caller ask twice, and the
   * second question is one no input answers no.
   *
   * That branch used to cast the parsed JSON straight to the config type, so it
   * was the one door into the app no schema stood in, and the warning the user
   * read was a compatibility notice for something that had not been checked.
   */
  futureVersion?: ConfigReset
}

export type Migration<T> = (config: unknown) => T
