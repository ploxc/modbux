import {
  ConnectionConfig,
  RegisterConfig,
  DeepPartial,
  defaultConnectionConfig,
  defaultRegisterConfig,
  RegisterMapping
} from '@shared'
import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
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

  constructor() {
    this._readStateJson()
  }

  private _readStateJson = (): void => {
    const userData = app.getPath('userData')
    const stateJsonPath = join(userData, 'state.json')

    const exists = existsSync(stateJsonPath)
    if (!exists) return

    const stateJson = readFileSync(join(userData, 'state.json')).toString()

    try {
      const defaultState: State = {
        connectionConfig: defaultConnectionConfig,
        registerConfig: defaultRegisterConfig
      }

      // Merge to make sure we don't corrupt the settings by a corrupt state.json file
      const state = merge(defaultState, JSON.parse(stateJson) as State)

      // Update with values from state.json
      this._connectionConfig = state.connectionConfig
      this._registerConfig = state.registerConfig
    } catch (error) {
      console.error('Failed to parse state.json:', error)
    }

    this._writeStateJson()
  }

  private _writeStateJson = (): void => {
    const userData = app.getPath('userData')
    const stateJsonPath = join(userData, 'state.json')

    const stateJson = JSON.stringify(
      {
        connectionConfig: this._connectionConfig,
        registerConfig: this._registerConfig
      },
      null,
      2
    )

    try {
      writeFileSync(stateJsonPath, stateJson)
    } catch (error) {
      console.error('Failed to write state.json:', error)
    }
  }

  public updateConnectionConfig(config: DeepPartial<ConnectionConfig>): void {
    this._connectionConfig = merge<ConnectionConfig, DeepPartial<ConnectionConfig>>(
      this._connectionConfig,
      config
    )
    this._writeStateJson()
  }

  public updateRegisterConfig(config: DeepPartial<RegisterConfig>): void {
    this._registerConfig = merge<RegisterConfig, DeepPartial<RegisterConfig>>(
      this._registerConfig,
      config
    )
    this._writeStateJson()
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
}
