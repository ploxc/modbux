import {
  BackendMessage,
  RemoveRegisterParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncRegisterValueParams,
  createRegisters,
  ResetRegistersParams,
  ResetBoolsParams,
  CreateServerParams,
  ServerData,
  ValueGenerators,
  AddRegisterParams,
  UnitIdString,
  UnitIdStringSchema,
  BooleanRegisters,
  NumberRegisters
} from '@shared'
import { IServiceVector, ServerTCP, FCallbackVal } from 'modbus-serial'
import { Windows } from '@shared'
import { ValueGenerator } from './modbusServer/valueGenerator'

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
  coils: new Array(65535).fill(false),
  discrete_inputs: new Array(65535).fill(false),
  input_registers: new Array(65535).fill(0),
  holding_registers: new Array(65535).fill(0)
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

type ServerDataUnitMap = Map<UnitIdString, ServerData>
type ValueGeneratorsUnitMap = Map<UnitIdString, ValueGenerators>

type ServerDataMap = Map<string, ServerDataUnitMap>
type ValueGeneratorsMap = Map<string, ValueGeneratorsUnitMap>

export interface ServerParams {
  windows: Windows
}

export class ModbusServer {
  private _port: Map<string, number> = new Map()
  private _servers: Map<string, ServerTCP> = new Map()
  private _windows: Windows

  // Map to store server data for each unit ID of a server UUID
  private _serverData: ServerDataMap = new Map()
  private _generatorMap: ValueGeneratorsMap = new Map()

  constructor({ windows }: ServerParams) {
    this._windows = windows
  }

  // Generic “ensure inner map” helper.
  //   • OuterMap is Map<string, M>, where M is some kind of Map<UnitIdString, T>.
  //   • factory(): M must produce a fresh instance of that inner map type.
  private _ensureInnerMap<T>(outerMap: Map<string, T>, uuid: string): T {
    let inner = outerMap.get(uuid)
    if (!inner) {
      inner = new Map() as T
      outerMap.set(uuid, inner)
    }
    return inner
  }

  private _getVector = (uuid: string): IServiceVector => ({
    getCoil: this._getCoil(uuid),
    getDiscreteInput: this._getDiscreteInput(uuid),
    getInputRegister: this._getInputRegister(uuid),
    getHoldingRegister: this._getHoldingRegister(uuid),
    setCoil: this._setCoil(uuid),
    setRegister: this._setHoldingRegister(uuid)
  })

  public createServer = async ({ uuid, port }: CreateServerParams): Promise<void> => {
    const existingPorts = Array.from(this._port.values())
    if (port && existingPorts.includes(port) && port !== this._port.get(uuid))
      throw new Error(`Port ${port} is already in use`)
    this._port.set(uuid, port)

    const server = this._servers.get(uuid)
    if (server) {
      await new Promise<void>((resolve) => {
        server.close((err) => {
          if (err)
            this._emitMessage({ message: 'Error closing server', variant: 'error', error: err })
          resolve()
        })
      })
    } else {
      // This is a brand‐new server uuid. We need to create and populate
      // a Map<UnitIdString, ValueGenerators> under this._generatorMap.get(uuid).
      //
      // 1) Use _ensureInnerMap to either retrieve an existing inner‐map
      //    (should be none, since server was missing) or create a fresh one.
      const perUnitMap = this._ensureInnerMap<ValueGeneratorsUnitMap>(this._generatorMap, uuid)

      // 2) Populate that inner map for every valid unitId (0..255):
      UnitIdStringSchema.options.forEach((unitId) => {
        // getDefaultGenerators() returns your default ValueGenerators for one unitId
        perUnitMap.set(unitId, getDefaultGenerators())
      })
    }

    this._servers.set(
      uuid,
      new ServerTCP(this._getVector(uuid), {
        host: '0.0.0.0',
        port: port || 502
      })
    )
  }

  public deleteServer = async (uuid: string): Promise<void> => {
    const server = this._servers.get(uuid)
    if (!server) throw new Error(`No server found for UUID ${uuid}`)
    await new Promise<void>((resolve) => {
      server.close((err) => {
        if (err)
          this._emitMessage({ message: 'Error closing server', variant: 'error', error: err })
        resolve()
      })
    })
    this._servers.delete(uuid)
    this._port.delete(uuid)
    this._generatorMap.delete(uuid)
  }

  //
  //
  // Events
  private _emitMessage = (message: BackendMessage): void => {
    this._windows.send('backend_message', message)
  }

  //
  //
  // Public methods
  public setPort = async ({ uuid, port }: CreateServerParams): Promise<void> => {
    await this.createServer({ uuid, port })
  }
  public restartServer = async (uuid: string): Promise<void> => {
    const port = this._port.get(uuid)
    if (!port) throw new Error('No port found for server')
    await this.createServer({ uuid, port })
  }

  public addRegister = ({
    uuid,
    unitId,
    params: { address, registerType, dataType, min, max, interval, value, littleEndian, comment }
  }: AddRegisterParams): void => {
    // Remove existing generator if exists
    const serverGenerators = this._generatorMap.get(uuid)?.get(unitId) || getDefaultGenerators()
    const generators = serverGenerators[registerType]
    const generator = generators.get(address)

    generator?.dispose()
    generators.delete(address)

    const serverData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()

    const fixedValue = value !== undefined

    // Add fixed value to the serverdata
    if (fixedValue) {
      const registers = createRegisters(dataType, value, littleEndian)
      registers.forEach((register, index) => {
        serverData[registerType][address + index] = register
      })

      const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
      perUnitMap.set(unitId, serverData)
      this._windows.send('register_value', { uuid, unitId, registerType, address, value })
      return
    }

    // Add a generator
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
        comment
      })
    )
  }
  public removeRegisterValue = ({ uuid, registerType, address }: RemoveRegisterParams): void => {
    // Reset fixed value
    const serverData = this._serverData.get(uuid)
    if (serverData) serverData[registerType][address] = 0

    // Reset generator if exists
    const serverGenerators = this._generatorMap.get(uuid)
    if (!serverGenerators) return

    const generators = serverGenerators[registerType]
    if (!generators) return

    const generator = generators.get(address)
    if (!generator) return

    generator.dispose()
    generators.delete(address)
  }

  public syncServerRegisters = ({
    uuid,
    unitId,
    registerValues
  }: SyncRegisterValueParams): void => {
    // Reset all registers before syncing
    this.resetRegisters({ uuid, unitId, registerType: 'holding_registers' })
    this.resetRegisters({ uuid, unitId, registerType: 'input_registers' })
    // Add all registers from the received array
    for (const params of registerValues) this.addRegister({ uuid, unitId, params })
  }

  public resetRegisters = ({ uuid, unitId, registerType }: ResetRegistersParams): void => {
    // Dispose all generators
    const serverGenerators = this._generatorMap.get(uuid)
    const generators = serverGenerators?.[registerType]
    generators?.forEach((generator) => generator.dispose())

    // Reset server data
    const serverData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()
    const perUnitMap = this._ensureInnerMap<ServerDataUnitMap>(this._serverData, uuid)
    serverData[registerType] = new Array(65535).fill(0)
    perUnitMap.set(unitId, serverData)
  }

  public setBool = ({ uuid, unitId, registerType, address, state }: SetBooleanParameters): void => {
    const serverData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()
    serverData[registerType][address] = state

    const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)

    this._windows.send('boolean_value', { uuid, unitId, registerType, address, value: state })
  }

  public resetBools = ({ uuid, unitId, registerType }: ResetBoolsParams): void => {
    // Reset server data
    const serverData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()
    serverData[registerType] = new Array(65535).fill(false)
    const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)
  }

  public syncBools = (params: SyncBoolsParameters): void => {
    const { uuid, unitId } = params
    const serverData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()

    // Sync coils and discrete inputs
    params['coils'].forEach((value, index) => (serverData['coils'][index] = value))
    params['discrete_inputs'].forEach((value, index) => {
      serverData['discrete_inputs'][index] = value
    })

    const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
    perUnitMap.set(unitId, serverData)
  }

  //
  //
  // Vector methods
  private _getCoil: (uuid: string) => IServiceVector['getCoil'] =
    (uuid) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.coils[address]
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  private _getDiscreteInput: (uuid: string) => IServiceVector['getDiscreteInput'] =
    (uuid) => async (address, unitIdNumber, cb) => {
      const unitId = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitId.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, false)

      const value = this._serverData.get(uuid)?.get(unitId.data)?.discrete_inputs[address]
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, false)

      cb(null, value)
    }

  private _getInputRegister: (uuid: string) => IServiceVector['getInputRegister'] =
    (uuid) => async (address, unitId, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)

      const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.input_registers[address]
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, 0)

      cb(null, value)
    }

  private _getHoldingRegister: (uuid: string) => IServiceVector['getHoldingRegister'] =
    (uuid) => async (address, unitId, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitId))
      console.log({ unitIdSafe })
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)

      const value = this._serverData.get(uuid)?.get(unitIdSafe.data)?.holding_registers[address]
      console.log({ value })
      if (value === undefined) return this._mbError(ILLEGAL_DATA_ADDRESS, cb, 0)

      console.log([address, unitId, value])

      cb(null, value)
    }

  private _setCoil: (uuid: string) => IServiceVector['setCoil'] =
    (uuid) => async (address, value, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      const currentServerData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()
      currentServerData.coils[address] = value

      const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
      perUnitMap.set(unitId, currentServerData)

      const registerType: BooleanRegisters = 'coils'
      this._windows.send('boolean_value', { uuid, unitId, registerType, address, value })

      cb(null)
    }

  private _setHoldingRegister: (uuid: string) => IServiceVector['setRegister'] =
    (uuid) => async (address, value, unitIdNumber, cb) => {
      const unitIdSafe = UnitIdStringSchema.safeParse(String(unitIdNumber))
      if (!unitIdSafe.success) return this._mbError(SERVER_DEVICE_FAILURE, cb, 0)
      const unitId = unitIdSafe.data

      const currentServerData = this._serverData.get(uuid)?.get(unitId) || getDefaultServerData()
      currentServerData.holding_registers[address] = value

      const perUnitMap = this._ensureInnerMap(this._serverData, uuid)
      perUnitMap.set(unitId, currentServerData)

      const registerType: NumberRegisters = 'holding_registers'
      this._windows.send('register_value', { uuid, unitId, registerType, address, value })

      cb(null)
    }

  private _mbError<T>(code: number, cb: FCallbackVal<T>, value: T): void {
    const err = new Error()
    err['modbusErrorCode'] = code
    cb(err, value)
  }
}
