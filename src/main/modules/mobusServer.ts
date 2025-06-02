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
  SetUnitIdParams,
  ServerData,
  ValueGenerators,
  AddRegisterParams
} from '@shared'
import { IServiceVector, ServerTCP } from 'modbus-serial'
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

export interface ServerParams {
  windows: Windows
}

export class ModbusServer {
  private _servers: Map<string, ServerTCP> = new Map()
  private _unitID: Map<string, number | undefined> = new Map()
  private _port: Map<string, number> = new Map()
  private _serverData: Map<string, ServerData> = new Map()
  private _windows: Windows

  private _generatorMap: Map<string, ValueGenerators> = new Map()

  constructor({ windows }: ServerParams) {
    this._windows = windows
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
      this._generatorMap.set(uuid, getDefaultGenerators())
    }

    const vector = this._getVector(uuid)
    const unitID = this._unitID.get(uuid)

    this._servers.set(
      uuid,
      new ServerTCP(vector, {
        host: '0.0.0.0',
        unitID,
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
    this._unitID.delete(uuid)
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
  public setId = async ({ uuid, unitID }: SetUnitIdParams): Promise<void> => {
    this._unitID.set(uuid, unitID)
    const port = this._port.get(uuid)
    if (!port) throw new Error('No port found for server')
    await this.createServer({ uuid, port })
  }
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
    params: { address, registerType, dataType, min, max, interval, value, littleEndian, comment }
  }: AddRegisterParams): void => {
    // Remove existing generator if exists
    const serverGenerators = this._generatorMap.get(uuid) || getDefaultGenerators()
    const generators = serverGenerators[registerType]
    const generator = generators.get(address)

    generator?.dispose()
    generators.delete(address)

    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    const fixedValue = value !== undefined

    // Add fixed value to the serverdata
    if (fixedValue) {
      const registers = createRegisters(dataType, value, littleEndian)
      registers.forEach((register, index) => {
        serverData[registerType][address + index] = register
      })
      this._serverData.set(uuid, serverData)
      this._windows.send('register_value', { uuid, registerType, address, value })
      return
    }

    // Add a generator
    generators.set(
      address,
      new ValueGenerator({
        uuid,
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

  public syncServerRegisters = ({ uuid, registerValues }: SyncRegisterValueParams): void => {
    // Reset all registers before syncing
    this.resetRegisters({ uuid, registerType: 'holding_registers' })
    this.resetRegisters({ uuid, registerType: 'input_registers' })
    // Add all registers from the received array
    for (const params of registerValues) this.addRegister({ uuid, params })
  }

  public resetRegisters = ({ uuid, registerType }: ResetRegistersParams): void => {
    // Dispose all generators
    const serverGenerators = this._generatorMap.get(uuid)
    const generators = serverGenerators?.[registerType]
    generators?.forEach((generator) => generator.dispose())

    // Reset server data
    const serverData = this._serverData.get(uuid) || getDefaultServerData()
    serverData[registerType] = new Array(65535).fill(0)
    this._serverData.set(uuid, serverData)
  }

  public setBool = ({ uuid, registerType, address, state }: SetBooleanParameters): void => {
    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    serverData[registerType][address] = state
    this._serverData.set(uuid, serverData)

    this._windows.send('boolean_value', { uuid, registerType, address, state })
  }

  public resetBools = ({ uuid, registerType }: ResetBoolsParams): void => {
    // Reset server data
    const serverData = this._serverData.get(uuid) || getDefaultServerData()
    serverData[registerType] = new Array(65535).fill(false)
    this._serverData.set(uuid, serverData)
  }

  public syncBools = (params: SyncBoolsParameters): void => {
    const { uuid } = params
    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    // Sync coils and discrete inputs
    params['coils'].forEach((value, index) => (serverData['coils'][index] = value))
    params['discrete_inputs'].forEach((value, index) => {
      serverData['discrete_inputs'][index] = value
    })

    this._serverData.set(uuid, serverData)
  }

  //
  //
  // Vector methods
  private _getCoil: (uuid: string) => IServiceVector['getCoil'] =
    (uuid) => async (address: number) => {
      return this._serverData.get(uuid)?.['coils'][address]
    }
  private _getDiscreteInput: (uuid: string) => IServiceVector['getDiscreteInput'] =
    (uuid) => async (address: number) => {
      return this._serverData.get(uuid)?.['discrete_inputs'][address]
    }

  private _getInputRegister: (uuid: string) => IServiceVector['getInputRegister'] =
    (uuid) => async (address: number) => {
      return this._serverData.get(uuid)?.['input_registers'][address]
    }
  private _getHoldingRegister: (uuid: string) => IServiceVector['getHoldingRegister'] =
    (uuid) => async (address: number) => {
      return this._serverData.get(uuid)?.['holding_registers'][address]
    }
  private _setCoil: (uuid: string) => IServiceVector['setCoil'] =
    (uuid) => async (address: number, state: boolean) => {
      const currentServerData = this._serverData.get(uuid) || getDefaultServerData()
      currentServerData.coils[address] = state
      this._serverData.set(uuid, currentServerData)

      this._windows.send('boolean_value', { uuid, registerType: 'coils', address, state })
    }
  private _setHoldingRegister: (uuid: string) => IServiceVector['setRegister'] =
    (uuid) => async (address: number, value: number) => {
      const currentServerData = this._serverData.get(uuid) || getDefaultServerData()
      currentServerData['holding_registers'][address] = value
      this._serverData.set(uuid, currentServerData)

      this._windows.send('register_value', {
        uuid,
        registerType: 'holding_registers',
        address,
        value
      })
    }
}
