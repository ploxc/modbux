import { ConnectionSettings } from '@shared'

export interface ConnectionZustand extends ConnectionSettings {
  /** Take one setting, and hand main the settings with it. */
  setConnectionSetting: <Key extends keyof ConnectionSettings>(
    key: Key,
    value: ConnectionSettings[Key]
  ) => void
}
