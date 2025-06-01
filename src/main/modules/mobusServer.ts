import {
  BackendMessage,
  IpcEvent,
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

  private _getVector = (uuid: string) => ({
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

  public deleteServer = async (uuid: string) => {
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
  private _emitMessage = (message: BackendMessage) => {
    this._windows.send(IpcEvent.BackendMessage, message)
  }

  //
  //
  // Public methods
  public setId = async ({ uuid, unitID }: SetUnitIdParams) => {
    this._unitID.set(uuid, unitID)
    const port = this._port.get(uuid)
    if (!port) throw new Error('No port found for server')
    await this.createServer({ uuid, port })
  }
  public setPort = async ({ uuid, port }: CreateServerParams) => {
    await this.createServer({ uuid, port })
  }
  public restartServer = async (uuid: string) => {
    const port = this._port.get(uuid)
    if (!port) throw new Error('No port found for server')
    await this.createServer({ uuid, port })
  }

  public addRegister = ({
    uuid,
    params: { address, registerType, dataType, min, max, interval, value, littleEndian, comment }
  }: AddRegisterParams) => {
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
      this._windows.send(IpcEvent.RegisterValue, uuid, registerType, address, value)
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
  public removeRegisterValue = ({ uuid, registerType, address }: RemoveRegisterParams) => {
    const serverGenerators = this._generatorMap.get(uuid)
    if (!serverGenerators) return

    const generators = serverGenerators[registerType]
    if (!generators) return

    const generator = generators.get(address)
    if (!generator) return

    generator.dispose()
    generators.delete(address)
  }

  public syncServerRegisters = ({ uuid, registerValues }: SyncRegisterValueParams) => {
    for (const params of registerValues) this.addRegister({ uuid, params })
  }

  public resetRegisters = ({ uuid, registerType }: ResetRegistersParams) => {
    const serverGenerators = this._generatorMap.get(uuid)
    const generators = serverGenerators?.[registerType]
    generators?.forEach((generator) => generator.dispose())

    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    serverData[registerType] = new Array(65535).fill(0)
    this._serverData.set(uuid, serverData)
  }

  public setBool = ({ uuid, registerType, address, state }: SetBooleanParameters) => {
    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    serverData[registerType][address] = state
    this._serverData.set(uuid, serverData)

    this._windows.send(IpcEvent.BooleanValue, uuid, registerType, address, state)
  }

  public resetBools = ({ uuid, registerType }: ResetBoolsParams) => {
    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    serverData[registerType] = new Array(65535).fill(false)
    this._serverData.set(uuid, serverData)
  }

  public syncBools = (params: SyncBoolsParameters) => {
    const { uuid } = params
    const serverData = this._serverData.get(uuid) || getDefaultServerData()

    params.coils.forEach((value, index) => {
      serverData.coils[index] = value
    })
    params['discrete_inputs'].forEach((value, index) => {
      serverData['discrete_inputs'][index] = value
    })

    this._serverData.set(uuid, serverData)
  }

  //
  //
  // Vector methods
  private _getCoil: (uuid: string) => IServiceVector['getCoil'] =
    (uuid) => async (addr: number) => {
      return this._serverData.get(uuid)?.coils[addr]
    }
  private _getDiscreteInput: (uuid: string) => IServiceVector['getDiscreteInput'] =
    (uuid) => async (addr: number) => {
      return this._serverData.get(uuid)?.['discrete_inputs'][addr]
    }

  private _getInputRegister: (uuid: string) => IServiceVector['getInputRegister'] =
    (uuid) => async (addr: number) => {
      return this._serverData.get(uuid)?.['input_registers'][addr]
    }
  private _getHoldingRegister: (uuid: string) => IServiceVector['getHoldingRegister'] =
    (uuid) => async (addr: number) => {
      return this._serverData.get(uuid)?.['holding_registers'][addr]
    }
  private _setCoil: (uuid: string) => IServiceVector['setCoil'] =
    (uuid) => async (addr: number, value: boolean) => {
      const currentServerData = this._serverData.get(uuid) || getDefaultServerData()
      currentServerData.coils[addr] = value
      this._serverData.set(uuid, currentServerData)
      this._windows.send(IpcEvent.BooleanValue, uuid, 'coils', addr, value)
    }
  private _setHoldingRegister: (uuid: string) => IServiceVector['setRegister'] =
    (uuid) => async (addr: number, value: number) => {
      const currentServerData = this._serverData.get(uuid) || getDefaultServerData()
      currentServerData['holding_registers'][addr] = value
      this._serverData.set(uuid, currentServerData)
      this._windows.send(IpcEvent.RegisterValue, uuid, 'holding_registers', addr, value)
    }
}
