import {
  ClientConnectionConfigUpdate,
  ClientReadConfiguration,
  ClientRegisterConfigUpdate,
  ClientRegisterMapping,
  ClientState
} from '@shared'
import { AppState } from '../../state'
import { Windows } from '../../windows'
import { ModbusClient } from '../modbusClient'
import { Transports } from './transports'

/**
 * The clients main holds, one per uuid, and the transports they ride.
 *
 * A client exists once a window has asked for it by uuid, and every client
 * channel names the one it drives. A uuid nobody created reaches no client:
 * the channel answers `undefined` and says so, the way a refused payload does.
 */
export class Clients {
  private _windows: Windows
  private _transports: Transports
  private _clients = new Map<string, ModbusClient>()

  constructor(windows: Windows) {
    this._windows = windows
    this._transports = new Transports(windows)
  }

  /** Make the client under `uuid`, or leave the one already there alone. */
  public create = (uuid: string): void => {
    if (this._clients.has(uuid)) return
    this._clients.set(
      uuid,
      new ModbusClient({
        uuid,
        appState: new AppState(),
        windows: this._windows,
        transports: this._transports
      })
    )
  }

  /** The client under `uuid`, or undefined once the main window has been told. */
  public get = (uuid: string): ModbusClient | undefined => {
    const client = this._clients.get(uuid)
    if (client) return client
    this._windows.send(
      'backend_message',
      {
        message: 'That client does not exist, nothing was changed',
        variant: 'error',
        error: `no client ${uuid}`
      },
      'main'
    )
    return undefined
  }

  /** What every client is doing, by uuid. */
  public states = (): Record<string, ClientState> =>
    Object.fromEntries([...this._clients].map(([uuid, client]) => [uuid, client.state]))

  /**
   * Hand one client's config to `change`, and say whether a client was there.
   *
   * The four config channels answer `true` for a change main made and
   * `undefined` for a uuid it holds no client under, the answer a refused
   * payload gets too.
   */
  private _configure = (uuid: string, change: (config: AppState) => void): true | undefined => {
    const client = this.get(uuid)
    if (!client) return undefined
    change(client.config)
    return true
  }

  public updateConnectionConfig = ({
    uuid,
    connectionConfig
  }: ClientConnectionConfigUpdate): true | undefined =>
    this._configure(uuid, (config) => config.updateConnectionConfig(connectionConfig))

  public updateRegisterConfig = ({
    uuid,
    registerConfig
  }: ClientRegisterConfigUpdate): true | undefined =>
    this._configure(uuid, (config) => config.updateRegisterConfig(registerConfig))

  public setRegisterMapping = ({
    uuid,
    registerMapping
  }: ClientRegisterMapping): true | undefined =>
    this._configure(uuid, (config) => config.setRegisterMapping(registerMapping))

  public setReadConfiguration = ({
    uuid,
    readConfiguration
  }: ClientReadConfiguration): true | undefined =>
    this._configure(uuid, (config) => config.setReadConfiguration(readConfiguration))
}
