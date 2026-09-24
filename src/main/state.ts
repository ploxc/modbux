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

export class AppState {
  // Copies, because a field initialiser that names an export makes main's state
  // that export, until the first update replaces the tree.
  private _connectionConfig = structuredClone(defaultConnectionConfig)
  private _registerConfig = structuredClone(defaultRegisterConfig)
  private _registerMapping?: RegisterMapping
  private _readConfiguration = false
  private _readGeneration = 0

  /**
   * How often what a read is addressed to has changed.
   *
   * A read puts its requests on the wire under the unit id, register type,
   * address and length this state held when it started, and read configuration
   * decides whether the mapping or the toolbar's block is what it asks for.
   * Change one of those while the read is in flight and the reply describes the
   * old one, so `_read` takes this number before its first request and drops
   * what comes back once it has moved.
   *
   * The rest of both configs is not counted. A poll rate, a timeout or an
   * address base changes what the grid does with a read or when the next one
   * goes out, not what this one asked the device.
   */
  get readGeneration(): number {
    return this._readGeneration
  }

  /** The connection config `config` would leave, without leaving it. */
  public connectionConfigAfter(config: DeepPartial<ConnectionConfig>): ConnectionConfig {
    return merge<ConnectionConfig, DeepPartial<ConnectionConfig>>(
      this._connectionConfig,
      withoutUndefined(config)
    )
  }

  public updateConnectionConfig(config: DeepPartial<ConnectionConfig>): void {
    if (config.unitId !== undefined) this._readGeneration++
    this._connectionConfig = this.connectionConfigAfter(config)
  }

  public updateRegisterConfig(config: DeepPartial<RegisterConfig>): void {
    if (config.type !== undefined || config.address !== undefined || config.length !== undefined)
      this._readGeneration++
    this._registerConfig = merge<RegisterConfig, DeepPartial<RegisterConfig>>(
      this._registerConfig,
      withoutUndefined(config)
    )
  }

  public setRegisterMapping(mapping: RegisterMapping): void {
    this._readGeneration++
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
    this._readGeneration++
    this._readConfiguration = value
  }

  get readConfiguration(): boolean {
    return this._readConfiguration
  }
}
