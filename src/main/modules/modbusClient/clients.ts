import {
  ClientConnectionConfigUpdate,
  ClientCreate,
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

  /** Make the client under `uuid` if there is none, and hand it `config`. */
  public create = (uuid: string, config?: Omit<ClientCreate, 'uuid'>): void => {
    const client =
      this._clients.get(uuid) ??
      new ModbusClient({
        uuid,
        appState: new AppState(),
        windows: this._windows,
        transports: this._transports
      })
    this._clients.set(uuid, client)
    if (!config) return

    // A window that comes back hands main what it stored for a client main
    // holds already, maybe riding a connection. What that connection was
    // opened on stays, without the refusal an edit gets, and the unit id goes
    // out with each request, so it is taken either way.
    const { connectionConfig, registerConfig } = config
    client.config.updateConnectionConfig(
      client.state.connectState === 'disconnected'
        ? connectionConfig
        : { unitId: connectionConfig.unitId }
    )
    client.config.updateRegisterConfig(registerConfig)
  }

  /**
   * Take the client under `uuid` away, letting go of its connection first.
   *
   * A client nobody connected has nothing to let go of, so it is dropped
   * without the "Already disconnected" a Disconnect press gets.
   */
  public delete = async (uuid: string): Promise<void> => {
    const client = this.get(uuid)
    if (!client) return
    this._clients.delete(uuid)
    await client.dispose()
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

  /** Refused while the client rides a connection, where the change would move it. */
  public updateConnectionConfig = ({
    uuid,
    connectionConfig
  }: ClientConnectionConfigUpdate): true | undefined => {
    const client = this.get(uuid)
    if (!client?.mayUpdateConnection(connectionConfig)) return undefined
    client.config.updateConnectionConfig(connectionConfig)
    return true
  }

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
