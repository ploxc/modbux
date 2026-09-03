import {
  RemoveRegisterParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  createRegisters,
  createStringRegisters,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ServerData,
  ValueGenerators,
  AddRegisterParams,
  UnitIdString,
  UnitIdStringSchema,
  BooleanRegisters,
  NumberRegisters,
  StartRtuServerParams
} from '@shared'
import { ServerTCP, ServerSerial } from 'modbus-serial'
import { Windows } from '@shared'
import { ValueGenerator } from './modbusServer/valueGenerator'
import type { IServiceVector, FCallbackVal } from 'modbus-serial'
import { DEFAULT_UTF8_LENGTH, registerWidth } from '@shared'
import net from 'net'

const getDefaultGenerators = (): ValueGenerators => ({
  input_registers: new Map(),
  holding_registers: new Map()
})

const getDefaultServerData = (): {
  coils: boolean[]
  discrete_inputs: boolean[]
  input_registers: number[]
  holding_registers: number[]
} => ({
  coils: new Array(65536).fill(false),
  discrete_inputs: new Array(65536).fill(false),
  input_registers: new Array(65536).fill(0),
  holding_registers: new Array(65536).fill(0)
})

export const ILLEGAL_FUNCTION = 1
export const ILLEGAL_DATA_ADDRESS = 2
export const ILLEGAL_DATA_VALUE = 3
export const SERVER_DEVICE_FAILURE = 4
export const ACKNOWLEDGE = 5
export const SERVER_DEVICE_BUSY = 6
export const NEGATIVE_ACKNOWLEDGE = 7
export const MEMORY_PARITY_ERROR = 8
export const GATEWAY_PATH_UNAVAILABLE = 10
export const GATEWAY_TARGET_FAILED = 11
export const DEFAULT_MOBUS_PORT = 502

/**
 * The transport a vector answers on. RS-485 is shared and a socket is not, so a
 * request for a unit id this server does not host cannot get the same answer on
 * both.
 */
export type ServerTransport = 'tcp' | 'rtu'

/** Unit 0 addresses every device on an RTU bus at once. */
export const BROADCAST_UNIT_ID: UnitIdString = '0'

/** 0 is a port number the way "any" is a name: the kernel picks, and it listens. */
export const isPort = (port: number): boolean =>
  Number.isInteger(port) && port >= 1 && port <= 65535

/**
 * How long a bind may take before the listener is treated as failed.
 *
 * `listen` answers with one of its two events, so nobody sits through this. It
 * is here because a promise that neither event resolves would hang
 * `createServer` and every caller behind it.
 */
export const BIND_TIMEOUT_MS = 5000

type ServerDataUnitMap = Map<UnitIdString, ServerData>
type ValueGeneratorsUnitMap = Map<UnitIdString, ValueGenerators>

type ServerDataMap = Map<string, ServerDataUnitMap>
type ValueGeneratorsMap = Map<string, ValueGeneratorsUnitMap>

export interface ServerParams {
  windows: Windows
}

/**
 * ModbusServer class manages Modbus TCP servers, register data, and value generators for each server and unitId.
 * Handles server creation, deletion, register management, and value generator lifecycle.
 */
export class ModbusServer {
  private _port: Map<string, number> = new Map()
  private _servers: Map<string, ServerTCP> = new Map()
  private _rtuServer: ServerSerial | null = null
  private _rtuUuid: string | null = null
  private _rtuActive: boolean = false
  private _broadcastWarningSent: boolean = false
  private _windows: Windows

  // Map to store server data for each unit ID of a server UUID
  private _serverData: ServerDataMap = new Map()
  private _generatorMap: ValueGeneratorsMap = new Map()

  /**
   * Construct a ModbusServer instance.
   * @param windows - Windows IPC interface for backend/frontend communication.
   */
  constructor({ windows }: ServerParams) {
    this._windows = windows
  }

  /**
   * Ensures an inner map exists for a given UUID in the outer map, creating it if necessary.
   * @param outerMap - The outer map (by UUID)
   * @param uuid - The server UUID
   * @returns The inner map for the UUID
   */
  private _ensureInnerMap<T>(outerMap: Map<string, T>, uuid: string): T {
    let inner = outerMap.get(uuid)
    if (!inner) {
      inner = new Map() as T
      outerMap.set(uuid, inner)
    }
    return inner
  }

  /**
   * Returns a Modbus service vector for a given server UUID and transport.
   * This vector provides all the Modbus register accessors and mutators.
   */
  private _getVector = (uuid: string, transport: ServerTransport): IServiceVector => ({
    getCoil: this._getCoil(uuid, transport),
    getDiscreteInput: this._getDiscreteInput(uuid, transport),
    getInputRegister: this._getInputRegister(uuid, transport),
    getHoldingRegister: this._getHoldingRegister(uuid, transport),
    setCoil: this._setCoil(uuid, transport),
    setRegister: this._setHoldingRegister(uuid, transport)
  })

  /**
   * A unit id is one of ours when it has data under this uuid. The Select
   * offers all 256, and nothing but a register makes one of them exist.
   */
  private _hostsUnit(uuid: string, unitId: UnitIdString): boolean {
    return this._serverData.get(uuid)?.has(unitId) ?? false
  }

  /**
   * Unit 0 is broadcast on RTU. On TCP there is no broadcast at all and the
   * unit identifier routes through a gateway, so 0 is an address like any other.
   */
  private _isBroadcast(transport: ServerTransport, unitId: UnitIdString): boolean {
    return transport === 'rtu' && unitId === BROADCAST_UNIT_ID
  }

  /**
   * Answers a request for a unit id this server does not host.
   *
   * modbus-serial writes a frame when the vector calls `cb` and writes nothing
   * when it does not, so returning without calling it is silence on the wire.
   * On RS-485 silence is the only safe answer: the id belongs to a real device
   * answering at that moment, and a second frame collides with it. A socket
   * carries one device, so silence there is a client timeout instead, and the
   * gateway code says what happened.
   */
  private _refuseUnit<T>(transport: ServerTransport, cb: FCallbackVal<T>, value: T): void {
    if (transport === 'rtu') return
    this._mbError(GATEWAY_TARGET_FAILED, cb, value)
  }

  /**
   * Says once per RTU session that registers on unit 0 are unreachable.
   *
   * The renderer opens the port before it syncs registers, so on a fresh start
   * the data arrives after `initialized` and on a config load it is already
   * there. Hence the two call sites, and the flag that keeps them to one
   * message.
   */
  private _warnBroadcastUnit(uuid: string): void {
    if (!this._rtuActive || this._rtuUuid !== uuid) return
    if (this._broadcastWarningSent) return
    if (!this._hostsUnit(uuid, BROADCAST_UNIT_ID)) return

    this._broadcastWarningSent = true
    this._emitMessage({
      message: 'Unit 0 is the broadcast address on RTU. Its registers cannot be read.',
      variant: 'warning'
    })
  }

  /**
   * Helper to set server data for a unitId in the server data map.
   */
  private _setServerData(uuid: string, unitId: UnitIdString, serverData: ServerData): void {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)
    this._warnBroadcastUnit(uuid)
  }

  /**
   * Helper to dispose all value generators in a ValueGeneratorsUnitMap.
   * This stops all intervals and clears the generator maps.
   */
  private _disposeAllGenerators(unitMap: ValueGeneratorsUnitMap): void {
    for (const registerTypeGenerators of unitMap.values()) {
      registerTypeGenerators.holding_registers.forEach((g) => g.dispose())
      registerTypeGenerators.input_registers.forEach((g) => g.dispose())
    }
  }

  /**
   * Emits a backend message to the frontend via the Windows IPC interface.
   */
  private _emitMessage({
    message,
    variant,
    error
  }: {
    message: string
    variant: 'default' | 'error' | 'success' | 'warning' | 'info'
    error?: Error
  }): void {
    this._windows.send('backend_message', { message, variant, error })
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
    const server = new ServerTCP(this._getVector(uuid, 'tcp'), { host: '0.0.0.0', port })

    // // !Debug: Simulate connection loss by destroying incoming sockets after a delay.
    // // - Short delay (e.g. 3000ms): triggers burst detection (reconnects fail within the 10s stability window)
    // // - Long delay (e.g. 15000ms): allows stable connection, so the reconnect counter resets between drops
    // const netServer = server['_server'] as net.Server
    // netServer.on('connection', (sock) => {
    //   setTimeout(() => sock.destroy(), 15000)
    // })

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
   * vectors read `_serverData` when a request arrives rather than when they are
   * built, so nothing about the register data needs a fresh listener, and a
   * port change is `setPort`'s job. Rebinding drops every connected master, so
   * it happens only where it buys something.
   */
  public createServer = async ({ uuid, port }: CreateServerParams): Promise<number> => {
    // A stored 0 from before this was refused would send the server to a port
    // nobody can name, so it starts where it would have started without one.
    let actualPort = port !== undefined && isPort(port) ? port : DEFAULT_MOBUS_PORT
    const maxAttempts = 10000

    if (this._servers.has(uuid) && this._port.get(uuid) === actualPort) return actualPort

    await this._closeAndForget(uuid)

    for (let i = 0; i < maxAttempts; i++) {
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
    return actualPort
  }

  /**
   * Deletes a Modbus TCP server for the given UUID, cleaning up all resources.
   */
  public deleteServer = async (uuid: string): Promise<void> => {
    // Clean up RTU server if this UUID is the RTU server
    if (this._rtuUuid === uuid) {
      await this.stopRtuServer()
    }

    if (!this._servers.has(uuid)) {
      this._emitMessage({ message: `No server found for UUID ${uuid}`, variant: 'error' })
      return
    }
    await this._closeAndForget(uuid)
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      this._disposeAllGenerators(unitIdGenerators)
    }
    this._generatorMap.delete(uuid)
  }

  /**
   * Resets the server for a given UUID: disposes its value generators and
   * clears its register data.
   *
   * The vectors read `_serverData` per request, so the cleared data is what a
   * master gets from the listener that is already up. `createServer` is called
   * for the case where there is none, such as after a spell in RTU mode.
   */
  public resetServer = async (uuid: string): Promise<void> => {
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      this._disposeAllGenerators(unitIdGenerators)
    }
    this._serverData.delete(uuid)
    this._generatorMap.delete(uuid)
    const port = this._port.get(uuid)
    if (port) await this.createServer({ uuid, port })
  }

  /**
   * Adds a register or value generator for a given server and unitId.
   * If a generator already exists at the address, it is disposed and replaced.
   * If a fixed value is provided, sets the register directly.
   */
  public addRegister = ({ uuid, unitId, params, littleEndian }: AddRegisterParams): void => {
    const {
      address,
      registerType,
      dataType,
      min,
      max,
      interval,
      value,
      comment,
      stringValue,
      length
    } = params

    // Ensure generator map for this server and unitId
    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId) ?? getDefaultGenerators()

    if (!perUnitGeneratorMap.has(unitId)) {
      perUnitGeneratorMap.set(unitId, serverGenerators)
    }

    const generators = serverGenerators[registerType]
    const generator = generators.get(address)
    generator?.dispose()
    generators?.delete(address)

    // Ensure server data map for this server and unitId
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    this._setServerData(uuid, unitId, serverData)

    // If a fixed value is provided, set the register directly
    const fixedValue = !interval && value !== undefined
    if (fixedValue) {
      const registers =
        dataType === 'utf8'
          ? createStringRegisters(stringValue ?? '', length ?? DEFAULT_UTF8_LENGTH)
          : createRegisters(dataType, value, littleEndian)
      registers.forEach((register, index) => {
        const registerAddress = address + index
        serverData[registerType][registerAddress] = register
        this._windows.send('register_value', {
          uuid,
          unitId,
          registerType,
          address: registerAddress,
          raw: register
        })
      })
      this._setServerData(uuid, unitId, serverData)
      return
    }

    // Otherwise, add a value generator for this register
    generators.set(
      address,
      new ValueGenerator({
        uuid,
        unitId,
        windows: this._windows,
        serverData,
        address,
        dataType,
        min,
        max,
        interval,
        littleEndian,
        registerType,
        comment,
        stringValue,
        length
      })
    )
  }

  /**
   * Removes a register or value generator for a given server and unitId.
   * Disposes the generator if it exists and resets the register value.
   */
  public removeRegister = ({
    uuid,
    unitId,
    registerType,
    address,
    dataType,
    length
  }: RemoveRegisterParams): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)

    // Reset all registers occupied by this data type
    const registerCount = registerWidth(dataType, length)
    for (let i = 0; i < registerCount; i++) {
      serverData[registerType][address + i] = 0
    }

    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (!serverGenerators) return
    const generator = serverGenerators[registerType].get(address)
    if (!generator) return
    generator.dispose()
    serverGenerators[registerType].delete(address)
  }

  /**
   * Synchronizes all register values for a given server and unitId.
   * Resets all holding and input registers, then adds all provided registers.
   */
  public syncServerRegisters = ({
    uuid,
    unitId,
    registerValues,
    littleEndian
  }: SyncRegisterValueParams): void => {
    // Cleanup generators only for this unitId
    const unitIdGenerators = this._generatorMap.get(uuid)
    if (unitIdGenerators) {
      const generators = unitIdGenerators.get(unitId)
      if (generators) {
        generators.holding_registers.forEach((g) => g.dispose())
        generators.input_registers.forEach((g) => g.dispose())
        generators.holding_registers.clear()
        generators.input_registers.clear()
      }
    }
    this.resetRegisters({ uuid, unitId, registerType: 'holding_registers' })
    this.resetRegisters({ uuid, unitId, registerType: 'input_registers' })
    for (const params of registerValues) this.addRegister({ uuid, unitId, params, littleEndian })
  }

  /**
   * Resets all registers of a given type for a server and unitId.
   * Disposes all generators for that register type and clears the register data.
   */
  public resetRegisters = ({ uuid, unitId, registerType }: ResetRegistersParams): void => {
    // Dispose and clear only generators for this unitId and registerType
    const perUnitGeneratorMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(
      this._generatorMap,
      uuid
    )
    const serverGenerators = perUnitGeneratorMap.get(unitId)
    if (serverGenerators) {
      const generators = serverGenerators[registerType]
      generators.forEach((generator) => generator.dispose())
      generators.clear()
    }

    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType] = new Array(65536).fill(0)
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Sets a boolean value (coil or discrete input) for a given server and unitId.
   * Updates the server data and emits a value change event.
   */
  public setBool = ({ uuid, unitId, registerType, address, state }: SetBooleanParameters): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType][address] = state
    this._setServerData(uuid, unitId, serverData)
    this._windows.send('boolean_value', { uuid, unitId, registerType, address, value: state })
  }

  /**
   * Resets all boolean values (coils or discrete inputs) for a given server and unitId.
   */
  public resetBools = ({ uuid, unitId, registerType }: ResetBoolsParams): void => {
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    serverData[registerType] = new Array(65536).fill(false)
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Synchronizes all boolean values (coils and discrete inputs) for a given server and unitId.
   */
  public syncBools = (params: SyncBoolsParameters): void => {
    const { uuid, unitId } = params
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    const serverData = perUnitMap.get(unitId) ?? getDefaultServerData()
    if (!perUnitMap.has(unitId)) perUnitMap.set(unitId, serverData)
    params['coils'].forEach((value, index) => (serverData['coils'][index] = value))
    params['discrete_inputs'].forEach((value, index) => {
      serverData['discrete_inputs'][index] = value
    })
    this._setServerData(uuid, unitId, serverData)
  }

  /**
   * Starts an RTU server on a serial port for the given UUID.
   * Closes any existing RTU server first.
   */
  public startRtuServer = async ({ uuid, serialConfig }: StartRtuServerParams): Promise<void> => {
    if (!serialConfig.com.trim()) return
    await this.stopRtuServer()
    this._broadcastWarningSent = false

    try {
      // No unitID on purpose: passing one makes the library answer for that id
      // alone. Its default of 255 means "listen to all addresses", and the
      // vector filters, because only the vector knows which ids have data.
      this._rtuServer = new ServerSerial(this._getVector(uuid, 'rtu'), {
        path: serialConfig.com,
        baudRate: Number(serialConfig.options.baudRate),
        dataBits: serialConfig.options.dataBits as 8 | 7 | 6 | 5,
        stopBits: serialConfig.options.stopBits as 1 | 2,
        parity: serialConfig.options.parity ?? 'none'
      })
      this._rtuUuid = uuid

      // The SerialPort under the server. Its `error` listener catches open
      // failures, which would otherwise surface as an unhandled rejection.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const serverPath = (this._rtuServer as any)._serverPath
      const rtuServer = this._rtuServer
      if (serverPath && typeof serverPath.on === 'function') {
        serverPath.on('error', (err: Error) => {
          this._rtuActive = false
          this._emitMessage({
            message: `RTU server error: ${err?.message ?? err}`,
            variant: 'error'
          })
          this._windows.send('rtu_server_status', { active: false })
        })

        // `close` is the disconnect event. `@serialport/stream` documents it as
        // "in the case of a disconnect it will be called with a Disconnect Error
        // object", and its `_disconnected` answers a failed read with
        // `close(undefined, new DisconnectedError(...))` while pushing nothing
        // into the stream. So an adapter pulled between requests arrives here
        // and nowhere else, and without this the view keeps showing a server
        // whose port is gone.
        serverPath.on('close', (err?: Error) => {
          // A close this process caused is already reported. `stopRtuServer`
          // clears both fields before it closes the port, and the `error`
          // listener above clears `_rtuActive` for the write path, where one
          // unplug emits both events.
          if (this._rtuServer !== rtuServer || !this._rtuActive) return
          this._rtuActive = false
          this._emitMessage({
            message: `RTU server disconnected from ${serialConfig.com}`,
            variant: 'error',
            error: err
          })
          this._windows.send('rtu_server_status', { active: false })
        })
      }

      this._rtuServer.on('initialized', () => {
        this._rtuActive = true
        this._emitMessage({
          message: `RTU server started on ${serialConfig.com}`,
          variant: 'success'
        })
        this._windows.send('rtu_server_status', { active: true })
        this._warnBroadcastUnit(uuid)
      })

      this._rtuServer.on('error', (err) => {
        this._rtuActive = false
        this._emitMessage({
          message: `RTU server error: ${err?.message ?? err}`,
          variant: 'error'
        })
        this._windows.send('rtu_server_status', { active: false })
      })
    } catch (err) {
      this._emitMessage({
        message: `Failed to start RTU server: ${(err as Error)?.message ?? err}`,
        variant: 'error'
      })
    }
  }

  /**
   * Stops the active RTU server if one is running.
   */
  public stopRtuServer = async (): Promise<void> => {
    if (!this._rtuServer) return
    const server = this._rtuServer
    const wasActive = this._rtuActive
    this._rtuServer = null
    this._rtuUuid = null
    this._rtuActive = false
    this._broadcastWarningSent = false
    this._windows.send('rtu_server_status', { active: false })
    if (wasActive) {
      this._emitMessage({ message: 'RTU server stopped', variant: 'warning' })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch (err) {
      const error = err as Error
      // "Port is not open" is expected when the serial port never connected — ignore silently
      if (error?.message?.includes('Port is not open')) return
      console.error('Error closing RTU server:', error?.message, error?.stack)
      this._emitMessage({
        message: `Error closing RTU server: ${error?.message ?? err}`,
        variant: 'error',
        error
      })
    }
  }

  /**
   * Stops all running TCP servers. Does NOT clear server data or generators
   * so registers are preserved for restore when switching back to TCP.
   */
  public stopAllTcpServers = async (): Promise<void> => {
    for (const [, server] of this._servers) {
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err)
            this._emitMessage({ message: 'Error closing server', variant: 'error', error: err })
          resolve()
        })
      })
    }
    this._servers.clear()
    this._port.clear()
  }

  /**
   * Sets the port for a given server UUID. Strict: only tries the exact port,
   * no auto-increment. Emits error message on failure and returns the current port.
   */
  public setPort = async ({ uuid, port }: CreateServerParams): Promise<number> => {
    const requestedPort = port ?? DEFAULT_MOBUS_PORT
    const currentPort = this._port.get(uuid) ?? requestedPort

    // Port 0 is not a port, it is a request for whichever one is free, and
    // listening on it succeeds. The server would move somewhere nobody can
    // name, and the number sent back to the view would be the 0 it asked for.
    if (!isPort(requestedPort)) {
      this._emitMessage({ message: 'A server needs a port between 1 and 65535', variant: 'error' })
      return this._port.get(uuid) ?? DEFAULT_MOBUS_PORT
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

  // -------------------------------------------------------------------------
  // Vector methods for Modbus register access (used by modbus-serial)
  // -------------------------------------------------------------------------

  /**
   * Returns the value of a coil for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getCoil: (uuid: string, transport: ServerTransport) => IServiceVector['getCoil'] =
    (uuid, transport) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, false)
      // A broadcast is never acknowledged, so there is nothing to read from one.
      if (this._isBroadcast(transport, unitId.data)) return
      if (!this._hostsUnit(uuid, unitId.data)) return this._refuseUnit(transport, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.coils[address]
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  /**
   * Returns the value of a discrete input for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getDiscreteInput: (
    uuid: string,
    transport: ServerTransport
  ) => IServiceVector['getDiscreteInput'] =
    (uuid, transport) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, false)
      if (this._isBroadcast(transport, unitId.data)) return
      if (!this._hostsUnit(uuid, unitId.data)) return this._refuseUnit(transport, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.discrete_inputs[address]
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  /**
   * Returns the value of an input register for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getInputRegister: (
    uuid: string,
    transport: ServerTransport
  ) => IServiceVector['getInputRegister'] = (uuid, transport) => async (address, unitId, cb) => {
    const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
    if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
    if (this._isBroadcast(transport, unitIdSafe.data)) return
    if (!this._hostsUnit(uuid, unitIdSafe.data)) return this._refuseUnit(transport, cb, 0)

    const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.input_registers[address]
    if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, 0)

    cb(null, value)
  }

  /**
   * Returns the value of a holding register for a given address and unitId.
   * Calls the callback with the value or a Modbus error.
   */
  private _getHoldingRegister: (
    uuid: string,
    transport: ServerTransport
  ) => IServiceVector['getHoldingRegister'] = (uuid, transport) => async (address, unitId, cb) => {
    const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
    if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
    if (this._isBroadcast(transport, unitIdSafe.data)) return
    if (!this._hostsUnit(uuid, unitIdSafe.data)) return this._refuseUnit(transport, cb, 0)

    const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.holding_registers[address]
    if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, 0)

    cb(null, value)
  }

  /**
   * Writes a coil into a unit this server hosts and tells the view.
   */
  private _writeCoil(uuid: string, unitId: UnitIdString, address: number, value: boolean): void {
    const serverData = this._serverData.get(uuid)?.get(unitId)
    if (!serverData) return
    serverData.coils[address] = value

    const registerType: BooleanRegisters = 'coils'
    this._windows.send('boolean_value', { uuid, unitId, registerType, address, value })
  }

  /**
   * Writes a holding register into a unit this server hosts and tells the view.
   */
  private _writeHoldingRegister(
    uuid: string,
    unitId: UnitIdString,
    address: number,
    raw: number
  ): void {
    const serverData = this._serverData.get(uuid)?.get(unitId)
    if (!serverData) return
    serverData.holding_registers[address] = raw

    const registerType: NumberRegisters = 'holding_registers'
    this._windows.send('register_value', { uuid, unitId, registerType, address, raw })
  }

  /**
   * Sets the value of a coil for a given address and unitId.
   * Updates the server data and emits a value change event.
   */
  private _setCoil: (uuid: string, transport: ServerTransport) => IServiceVector['setCoil'] =
    (uuid, transport) => async (address, value, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      // A broadcast write reaches every unit on the bus and is never answered.
      if (this._isBroadcast(transport, unitId)) {
        for (const hostedUnitId of this._serverData.get(uuid)?.keys() ?? [])
          this._writeCoil(uuid, hostedUnitId, address, value)
        return
      }

      if (!this._hostsUnit(uuid, unitId)) return this._refuseUnit(transport, cb, 0)

      this._writeCoil(uuid, unitId, address, value)
      cb(null)
    }

  /**
   * Sets the value of a holding register for a given address and unitId.
   * Updates the server data and emits a value change event.
   */
  private _setHoldingRegister: (
    uuid: string,
    transport: ServerTransport
  ) => IServiceVector['setRegister'] =
    (uuid, transport) => async (address, raw, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      if (this._isBroadcast(transport, unitId)) {
        for (const hostedUnitId of this._serverData.get(uuid)?.keys() ?? [])
          this._writeHoldingRegister(uuid, hostedUnitId, address, raw)
        return
      }

      if (!this._hostsUnit(uuid, unitId)) return this._refuseUnit(transport, cb, 0)

      this._writeHoldingRegister(uuid, unitId, address, raw)
      cb(null)
    }

  /**
   * Helper for returning a Modbus error via callback and emitting a backend message.
   */
  private _mbError<T>(code: number, cb: FCallbackVal<T>, value: T): void {
    const err = new Error()
    err['modbusErrorCode'] = code
    cb(err, value)
  }
}
