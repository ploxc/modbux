import {
  BackendMessage,
  IpcEvent,
  RegisterType,
  RemoveValueGeneratorParams,
  SetBooleanParameters,
  SyncBoolsParameters,
  SyncValueGeneratorParams,
  ValueGeneratorParameters
} from '@shared'
import { IServiceVector, ServerTCP } from 'modbus-serial'
import { ServerData, ValueGenerator, ValueGenerators } from './modbusServer/valueGenerator'
import { Windows } from '@shared'

export interface ServerParams {
  windows: Windows
}

export class ModbusServer {
  private _server: ServerTCP
  private _vector: IServiceVector
  private _unitID: number | undefined
  private _port: number | undefined
  private _serverData: ServerData = {
    [RegisterType.Coils]: new Array(65535).fill(false),
    [RegisterType.DiscreteInputs]: new Array(65535).fill(false),
    [RegisterType.InputRegisters]: new Array(65535).fill(0),
    [RegisterType.HoldingRegisters]: new Array(65535).fill(0)
  }

  private _windows: Windows

  private _valueGenerators: ValueGenerators = {
    [RegisterType.InputRegisters]: new Map(),
    [RegisterType.HoldingRegisters]: new Map()
  }

  constructor({ windows }: ServerParams) {
    this._windows = windows

    this._vector = {
      getCoil: this._getCoil,
      getDiscreteInput: this._getDiscreteInput,
      getInputRegister: this._getInputRegister,
      getHoldingRegister: this._getHoldingRegister,
      setCoil: this._setCoil,
      setRegister: this._setHoldingRegister
    }

    this._server = new ServerTCP(this._vector, { host: '0.0.0.0' })
  }

  private _createNewServer = async () => {
    await new Promise<void>((resolve) => {
      this._server.close((err) => {
        if (err)
          this._emitMessage({ message: 'Error closing server', variant: 'error', error: err })
        resolve()
      })
    })
    this._server = new ServerTCP(this._vector, {
      host: '0.0.0.0',
      unitID: this._unitID,
      port: this._port
    })
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
  public setId = async (unitID: number | undefined) => {
    this._unitID = unitID
    await this._createNewServer()
  }
  public setPort = async (port: number | undefined) => {
    this._port = port
    await this._createNewServer()
  }
  public addValueGenerator = ({
    address,
    registerType,
    dataType,
    min,
    max,
    interval,
    littleEndian,
    comment
  }: ValueGeneratorParameters) => {
    const currentGenerator = this._valueGenerators[registerType].get(address) as ValueGenerator
    if (currentGenerator) currentGenerator.stop()
    this._valueGenerators[registerType].set(
      address,
      new ValueGenerator({
        windows: this._windows,
        serverData: this._serverData,
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
  public removeValueGenerator = ({ registerType, address }: RemoveValueGeneratorParams) => {
    this._valueGenerators[registerType].get(address)?.stop()
    this._valueGenerators[registerType].delete(address)
  }

  public syncServerRegisters = ({ valueGenerators }: SyncValueGeneratorParams) => {
    for (const params of valueGenerators) this.addValueGenerator(params)
  }

  public setBool = ({ registerType, address, state }: SetBooleanParameters) => {
    this._serverData[registerType][address] = state
    this._windows.send(IpcEvent.BooleanValue, registerType, address, state)
  }

  public resetBools = () => {
    this._serverData[RegisterType.Coils] = new Array(65535).fill(false)
    this._serverData[RegisterType.DiscreteInputs] = new Array(65535).fill(false)
  }

  public syncBools = (params: SyncBoolsParameters) => {
    this._serverData[RegisterType.Coils] = params[RegisterType.Coils]
    this._serverData[RegisterType.DiscreteInputs] = params[RegisterType.DiscreteInputs]
  }

  //
  //
  // Vector methods
  private _getCoil: IServiceVector['getCoil'] = async (addr: number) => {
    return this._serverData[RegisterType.Coils][addr]
  }
  private _getDiscreteInput: IServiceVector['getDiscreteInput'] = async (addr: number) => {
    return this._serverData[RegisterType.DiscreteInputs][addr]
  }

  private _getInputRegister: IServiceVector['getInputRegister'] = async (addr: number) => {
    return this._serverData[RegisterType.InputRegisters][addr]
  }
  private _getHoldingRegister: IServiceVector['getHoldingRegister'] = async (addr: number) => {
    return this._serverData[RegisterType.HoldingRegisters][addr]
  }
  private _setCoil: IServiceVector['setCoil'] = async (addr: number, value: boolean) => {
    this._serverData[RegisterType.Coils][addr] = value
    this._windows.send(IpcEvent.BooleanValue, RegisterType.Coils, addr, value)
  }
  private _setHoldingRegister: IServiceVector['setRegister'] = async (
    addr: number,
    value: number
  ) => {
    this._serverData[RegisterType.HoldingRegisters][addr] = value
  }
}
