import {
  RemoveRegisterParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  AddRegisterParams,
  StartRtuServerParams
} from '@shared'
import { ServerTCP } from 'modbus-serial'
import { DEFAULT_MODBUS_PORT, ServerEndianness } from '@shared'
import { Windows } from '../windows'
import { emitServerMessage } from './modbusServer/messages'
import { ServerRegistry } from './modbusServer/registry'
import { RtuServer } from './modbusServer/rtu'
import { createVector } from './modbusServer/vector'
import net from 'net'

const isPort = (port: number): boolean => Number.isInteger(port) && port >= 1 && port <= 65535

/**
 * How long a bind is given to say whether it took.
 *
 * `ServerTCP` emits `initialized` or `serverError` and a bind that does
 * neither leaves the await unresolved, which would hang the invoke behind it.
 * Five seconds is a loopback listen, which is microseconds when it works.
 */
export const BIND_TIMEOUT_MS = 5000

interface ServerParams {
  windows: Windows
}

/**
 * ModbusServer class manages Modbus TCP servers, register data, and value generators for each server and unitId.
 * Handles server creation, deletion, register management, and value generator lifecycle.
 */
export class ModbusServer {
  private _port: Map<string, number> = new Map()
  private _servers: Map<string, ServerTCP> = new Map()
  private _windows: Windows

  /** What every server holds, keyed by uuid and then by unit id. */
  private _registry: ServerRegistry

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
    this._windows = windows
    this._registry = new ServerRegistry({
      windows,
      onUnitData: (uuid): void => this._rtu.warnBroadcastUnit(uuid)
    })
    this._rtu = new RtuServer({ windows, registry: this._registry })
  }

  private _emitMessage(params: Parameters<typeof emitServerMessage>[1]): void {
    emitServerMessage(this._windows, params)
  }

  /**
   * Checks if a TCP port is available for binding.
   * Returns an object with availability and optional error code (e.g. EACCES, EADDRINUSE).
   */
  private async _isPortAvailable(
    port: number
  ): Promise<{ available: boolean; errorCode?: string }> {
    return new Promise((resolve) => {
      const tester = net.createServer()
      tester.once('error', (err: NodeJS.ErrnoException) => {
        resolve({ available: false, errorCode: err.code })
      })
      tester.once('listening', () => {
        tester.close(() => resolve({ available: true }))
      })
      tester.listen(port, '0.0.0.0')
    })
  }

  /**
   * Closes the listener registered for a UUID and forgets it, if there is one.
   *
   * `ServerTCP.close` destroys every socket in `modbus.socks`, so whoever was
   * connected gets a FIN.
   */
  private async _closeAndForget(uuid: string): Promise<void> {
    const existingServer = this._servers.get(uuid)
    if (!existingServer) return
    await new Promise<void>((resolve) => {
      existingServer.close((err) => {
        if (err)
          this._emitMessage({ message: 'Error closing server', variant: 'error', error: err })
        resolve()
      })
    })
    this._servers.delete(uuid)
    this._port.delete(uuid)
  }

  /**
   * Binds a TCP listener for a UUID and answers what the socket did.
   *
   * The constructor returns before `listen` has finished, and a refused bind
   * arrives as a `serverError` carrying `EADDRINUSE` rather than as a throw. A
   * constructor that returned is therefore no evidence of a listener, so the
   * maps are written only once one of the two events has said so.
   */
  private async _bindServer(
    uuid: string,
    port: number
  ): Promise<{ ok: boolean; errorCode?: string }> {
    const server = new ServerTCP(createVector(this._registry, uuid, 'tcp'), {
      host: '0.0.0.0',
      port
    })

    const result = await new Promise<{ ok: boolean; errorCode?: string }>((resolve) => {
      const timer = setTimeout(
        () => resolve({ ok: false, errorCode: 'ETIMEDOUT' }),
        BIND_TIMEOUT_MS
      )
      server.on('initialized', () => {
        clearTimeout(timer)
        resolve({ ok: true })
      })
      server.on('serverError', (err) => {
        clearTimeout(timer)
        resolve({ ok: false, errorCode: (err as NodeJS.ErrnoException | null)?.code })
      })
    })

    if (!result.ok) {
      server.close(() => {})
      return result
    }

    this._servers.set(uuid, server)
    this._port.set(uuid, port)
    return result
  }

  /**
   * Creates a Modbus TCP server for the given UUID and port.
   * Returns the actual port used (may differ from requested if taken).
   *
   * A listener already on the requested port is the answer to this call. The
   * vectors read the registry when a request arrives rather than when they are
   * built, so nothing about the register data needs a fresh listener, and a
   * port change is `setPort`'s job. Rebinding drops every connected master, so
   * it happens only where it buys something.
   *
   * `undefined` is "no listener, and a message is on its way". The walk ends on
   * either bound, and the far one is ten thousand consecutive busy ports.
   */
  public createServer = async ({ uuid, port }: CreateServerParams): Promise<number | undefined> => {
    // A stored 0 from before this was refused would send the server to a port
    // nobody can name, so it starts where it would have started without one.
    let actualPort = port !== undefined && isPort(port) ? port : DEFAULT_MODBUS_PORT
    const maxAttempts = 10000

    if (this._servers.has(uuid) && this._port.get(uuid) === actualPort) return actualPort

    // Read before the close, because that is what forgets it.
    const previousPort = this._port.get(uuid)
    await this._closeAndForget(uuid)

    for (let i = 0; i < maxAttempts; i++) {
      // 65535 taken increments to 65536, where `listen` throws
      // `ERR_SOCKET_BAD_PORT` inside `_isPortAvailable`'s executor and the
      // invoke rejects instead of answering.
      if (!isPort(actualPort)) break

      const result = await this._isPortAvailable(actualPort)
      if (result.available) {
        const bind = await this._bindServer(uuid, actualPort)
        if (bind.ok) return actualPort
      }
      actualPort++
    }
    this._emitMessage({
      message: 'No available port found',
      variant: 'error',
      error: undefined
    })

    // The listener that was up was closed before the walk, so put it back
    // rather than leave the uuid with none. `setPort` answers the same way.
    if (previousPort === undefined) return undefined

    const restored = await this._bindServer(uuid, previousPort)
    if (restored.ok) return previousPort

    this._emitMessage({
      message: `The server could not be restarted on port ${previousPort}`,
      variant: 'error'
    })
    return undefined
  }

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

    await this._closeAndForget(uuid)
  }

  /**
   * Resets the server for a given UUID: disposes its value generators and
   * clears its register data.
   *
   * The vectors read the registry per request, so the cleared data is what a
   * master gets from the listener that is already up.
   *
   * `createServer` rebinds nothing from here. `_bindServer` writes `_port` and
   * `_servers` on consecutive lines and `_closeAndForget` deletes both, so a
   * stored port means a listener on that port, which is `createServer`'s first
   * return. After a spell in RTU mode there is no stored port and the call does
   * not happen at all.
   */
  public resetServer = async (uuid: string): Promise<void> => {
    this._registry.clearData(uuid)
    const port = this._port.get(uuid)
    if (port) await this.createServer({ uuid, port })
  }

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

  /** Starts an RTU server on a serial port for the given UUID. */
  public startRtuServer = (params: StartRtuServerParams): Promise<void> => this._rtu.start(params)

  /** Stops the active RTU server if one is running. */
  public stopRtuServer = (): Promise<void> => this._rtu.stop()

  /**
   * Stops all running TCP servers. Does NOT clear server data or generators
   * so registers are preserved for restore when switching back to TCP.
   *
   * `_closeAndForget` per uuid, which is the same close and the same message,
   * and it deletes both maps' entry rather than clearing the maps at the end.
   * The key sets cannot differ: `_bindServer` writes `_servers` and `_port` on
   * consecutive lines and nothing else writes either.
   */
  public stopAllTcpServers = async (): Promise<void> => {
    for (const uuid of [...this._servers.keys()]) await this._closeAndForget(uuid)
  }

  /**
   * Sets the port for a given server UUID. Strict: only tries the exact port,
   * no auto-increment. Emits error message on failure and returns the current port.
   */
  public setPort = async ({ uuid, port }: CreateServerParams): Promise<number> => {
    const requestedPort = port ?? DEFAULT_MODBUS_PORT
    const currentPort = this._port.get(uuid) ?? requestedPort

    // Port 0 is not a port, it is a request for whichever one is free, and
    // listening on it succeeds. The server would move somewhere nobody can
    // name, and the number sent back to the view would be the 0 it asked for.
    if (!isPort(requestedPort)) {
      this._emitMessage({ message: 'A server needs a port between 1 and 65535', variant: 'error' })
      return this._port.get(uuid) ?? DEFAULT_MODBUS_PORT
    }

    const result = await this._isPortAvailable(requestedPort)
    if (!result.available) {
      const message =
        result.errorCode === 'EACCES'
          ? `Port ${requestedPort} requires elevated privileges`
          : `Port ${requestedPort} is already in use`
      this._emitMessage({ message, variant: 'error' })
      return currentPort
    }

    // Port is confirmed available — now close the existing server
    await this._closeAndForget(uuid)

    const bind = await this._bindServer(uuid, requestedPort)
    if (bind.ok) return requestedPort

    // The probe above passed and the bind still failed, so something took the
    // port in between. The old listener is already gone, so put it back rather
    // than leave the uuid with none.
    this._emitMessage({ message: `Port ${requestedPort} is already in use`, variant: 'error' })
    const restored = await this._bindServer(uuid, currentPort)
    if (!restored.ok) {
      this._emitMessage({
        message: `The server could not be restarted on port ${currentPort}`,
        variant: 'error'
      })
    }
    return currentPort
  }
}
