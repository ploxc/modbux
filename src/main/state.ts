import {
  ConnectionConfig,
  RegisterConfig,
  DeepPartial,
  defaultConnectionConfig,
  defaultRegisterConfig,
  RegisterMapping
} from '@shared'
import merge from 'deepmerge'

/**
 * The same value without the keys whose value is `undefined`.
 *
 * `deepPartial()` keeps a key the payload set to `undefined` and `deepmerge`
 * copies it over the stored one, so one explicit `undefined` leaves the config
 * holding a value its own schema refuses. Electron's structured clone carries
 * such a key across the IPC hop, so the schema cannot be the thing that stops
 * it.
 *
 * Neither config holds an array today. An array is handed back whole anyway,
 * because recursing into one would return its indices as an object and
 * deepmerge would never see an array again.
 */
export const withoutUndefined = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value

  const kept: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    kept[key] = withoutUndefined(item)
  }
  return kept as T
}

export interface State {
  connectionConfig: ConnectionConfig
  registerConfig: RegisterConfig
  registerMapping?: RegisterMapping
}

export class AppState {
  private _connectionConfig = defaultConnectionConfig
  private _registerConfig = defaultRegisterConfig
  private _registerMapping?: RegisterMapping
  private _readConfiguration = false

  constructor() {
    /** No Construction */
  }

  public updateConnectionConfig(config: DeepPartial<ConnectionConfig>): void {
    this._connectionConfig = merge<ConnectionConfig, DeepPartial<ConnectionConfig>>(
      this._connectionConfig,
      withoutUndefined(config)
    )
  }

  public updateRegisterConfig(config: DeepPartial<RegisterConfig>): void {
    this._registerConfig = merge<RegisterConfig, DeepPartial<RegisterConfig>>(
      this._registerConfig,
      withoutUndefined(config)
    )
  }

  public setRegisterMapping(mapping: RegisterMapping): void {
    this._registerMapping = mapping
  }

  get connectionConfig(): ConnectionConfig {
    return this._connectionConfig
  }

  get registerConfig(): RegisterConfig {
    return this._registerConfig
  }

  get registerMapping(): RegisterMapping | undefined {
    return this._registerMapping
  }

  public setReadConfiguration(value: boolean): void {
    this._readConfiguration = value
  }

  get readConfiguration(): boolean {
    return this._readConfiguration
  }
}
