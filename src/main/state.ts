import {
  ConnectionConfig,
  RegisterConfig,
  DeepPartial,
  defaultConnectionConfig,
  defaultRegisterConfig,
  RegisterMapping
} from '@shared'
import merge from 'deepmerge'

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
      config
    )
  }

  public updateRegisterConfig(config: DeepPartial<RegisterConfig>): void {
    this._registerConfig = merge<RegisterConfig, DeepPartial<RegisterConfig>>(
      this._registerConfig,
      config
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
