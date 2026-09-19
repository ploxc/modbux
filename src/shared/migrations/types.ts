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
   * that is only ever set with it: the pair makes the caller ask twice, and the
   * second question is one no input answers no.
   *
   * The branch that sets it parses the file rather than casting it, so what the
   * user reads names the fields that did not come across instead of promising a
   * compatibility nothing checked.
   */
  futureVersion?: ConfigReset
}

export type Migration<T> = (config: unknown) => T
