import {
  RemoveRegisterParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  AddRegisterParams,
  RegisterParams,
  UnitIdString,
  StartRtuServerParams,
  ServerEndianness
} from '@shared'
import { Windows } from '../windows'
import { ServerRegistry } from './modbusServer/registry'
import { RtuServer } from './modbusServer/rtu'
import { TcpServers } from './modbusServer/tcp'

interface ServerParams {
  windows: Windows
}

/**
 * The four parts of a Modbus server, and what one uuid means across them.
 *
 * `ServerRegistry` holds the registers, `TcpServers` holds the listeners,
 * `RtuServer` holds the serial port, and `createVector` is what the two
 * transports ask the registry through. Everything public here is what
 * `main/ipc.ts` calls; a method that names more than one part is one this
 * class answers itself, and the rest hand their parameters over.
 */
export class ModbusServer {
  /** What every server holds, keyed by uuid and then by unit id. */
  private _registry: ServerRegistry

  /** The TCP listeners, one per uuid. */
  private _tcp: TcpServers

  /** The one RTU server, and the uuid whose registers it serves. */
  private _rtu: RtuServer

  /** Whether the RTU server is running, for a window that has to ask. */
  public get rtuActive(): boolean {
    return this._rtu.active
  }

  /**
   * Construct a ModbusServer instance.
   * @param windows - Windows IPC interface for backend/frontend communication.
   */
  constructor({ windows }: ServerParams) {
    // The registry's callback names `_rtu`, so the RTU server is built before
    // anything that could write a register. Nothing here does today, and the
    // order is what keeps that from mattering.
    this._registry = new ServerRegistry({
      windows,
      onUnitData: (uuid): void => this._rtu.warnBroadcastUnit(uuid)
    })
    this._rtu = new RtuServer({ windows, registry: this._registry })
    this._tcp = new TcpServers({ windows, registry: this._registry })
  }

  /** Binds a listener for a uuid, and answers the port it took. */
  public createServer = (params: CreateServerParams): Promise<number | undefined> =>
    this._tcp.create(params)

  /**
   * Deletes a server for the given UUID, releasing everything held under it.
   *
   * What the uuid holds goes first, whether or not a TCP listener was ever
   * bound. The registry holds every register of every unit id under the uuid,
   * and the delete button does not go through `resetServer`, which is the other
   * place that frees it.
   *
   * A uuid with no listener is silence rather than an error: a server whose
   * bind was refused keeps `ready` false in the store and its Delete button,
   * and it is still a server the user is deleting.
   */
  public deleteServer = async (uuid: string): Promise<void> => {
    // Clean up RTU server if this UUID is the RTU server
    if (this._rtu.uuid === uuid) {
      await this._rtu.stop()
    }

    this._registry.deleteUuid(uuid)

    await this._tcp.closeAndForget(uuid)
  }

  /**
   * Resets the server for a given UUID: disposes its value generators and
   * clears its register data.
   *
   * The vectors read the registry per request, so the cleared data is what a
   * master gets from the listener that is already up.
   *
   * `create` rebinds nothing from here. It writes `_port` and `_servers` on
   * consecutive lines and `closeAndForget` deletes both, so a stored port means
   * a listener on that port, which is `create`'s first return. After a spell in
   * RTU mode there is no stored port and the call does not happen at all.
   */
  public resetServer = async (uuid: string): Promise<void> => {
    this._registry.clearData(uuid)
    const port = this._tcp.portOf(uuid)
    if (port) await this._tcp.create({ uuid, port })
  }

  /** Moves a uuid to the exact port asked for, or says why it did not. */
  public setPort = (params: CreateServerParams): Promise<number> => this._tcp.setPort(params)

  /** Closes every TCP listener and keeps the registers for a restore. */
  public stopAllTcpServers = (): Promise<void> => this._tcp.stopAll()

  /** Sets the byte order this server encodes its registers in. */
  public setEndianness = (params: ServerEndianness): void => this._registry.setEndianness(params)

  /** Adds a register or value generator, and answers the words it now holds. */
  public addRegister = (params: AddRegisterParams): number[] | undefined =>
    this._registry.addRegister(params)

  /** Removes a register or value generator. */
  public removeRegister = (params: RemoveRegisterParams): void =>
    this._registry.removeRegister(params)

  /** Replaces every register of a unit with the ones given. */
  public syncServerRegisters = (params: SyncRegisterValueParams): void =>
    this._registry.syncServerRegisters(params)

  /** Clears one register type of a unit, generators and all. */
  public resetRegisters = (params: ResetRegistersParams): void =>
    this._registry.resetRegisters(params)

  /** Sets a coil or a discrete input. */
  public setBool = (params: SetBooleanParameters): void => this._registry.setBool(params)

  /** Clears every coil or every discrete input of a unit. */
  public resetBools = (params: ResetBoolsParams): void => this._registry.resetBools(params)

  /** Replaces both bool maps of a unit with what the renderer holds. */
  public syncBools = (params: SyncBoolsParameters): void => this._registry.syncBools(params)

  /** What every register of a unit was added with. */
  public registerParams = (uuid: string, unitId: UnitIdString): RegisterParams[] =>
    this._registry.registerParams(uuid, unitId)

  /** The port of every server with a TCP listener, by uuid. */
  public serverPorts = (): Record<string, number> => this._tcp.ports()

  /** Starts an RTU server on a serial port for the given UUID. */
  public startRtuServer = (params: StartRtuServerParams): Promise<void> => this._rtu.start(params)

  /** Stops the active RTU server if one is running. */
  public stopRtuServer = (): Promise<void> => this._rtu.stop()
}
