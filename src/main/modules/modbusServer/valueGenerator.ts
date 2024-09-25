import {
  createRegisters,
  DataType,
  IpcEvent,
  RegisterType,
  ValueGeneratorParameters
} from '@shared'
import { round } from 'lodash'
import { Windows } from '@shared'

export interface ServerData {
  [RegisterType.Coils]: boolean[]
  [RegisterType.DiscreteInputs]: boolean[]
  [RegisterType.InputRegisters]: number[]
  [RegisterType.HoldingRegisters]: number[]
}

export interface ValueGenerators {
  [RegisterType.InputRegisters]: Map<number, ValueGenerator>
  [RegisterType.HoldingRegisters]: Map<number, ValueGenerator>
}

interface ValueGeneratorParams {
  windows: Windows
  serverData: ServerData
  registerType: RegisterType.HoldingRegisters | RegisterType.InputRegisters
  address: number
  dataType: DataType
  min: number
  max: number
  interval: number
  littleEndian: boolean
  comment: string
}

export class ValueGenerator {
  private _windows: Windows
  private _serverData: ServerData
  private _registerType: RegisterType.HoldingRegisters | RegisterType.InputRegisters
  private _address: number
  private _dataType: DataType
  private _min: number
  private _max: number
  private _littleEndian: boolean
  private _interval: number
  private _comment: string

  private _intervalTimer: NodeJS.Timeout

  constructor({
    windows,
    serverData,
    registerType,
    address,
    dataType,
    min,
    max,
    littleEndian,
    interval,
    comment
  }: ValueGeneratorParams) {
    this._windows = windows
    this._serverData = serverData
    this._address = address
    this._dataType = dataType
    this._min = min
    this._max = max
    this._littleEndian = littleEndian
    this._registerType = registerType
    this._interval = interval
    this._comment = comment
    this._intervalTimer = setInterval(() => {
      this._updateValue()
    }, interval)
  }

  public stop = () => {
    clearInterval(this._intervalTimer)
  }

  private _updateValue = async () => {
    const value = round(Math.random() * (this._max - this._min) + this._min, 2)
    this._windows.send( IpcEvent.ValueGeneratorValue,
      this._registerType,
      this._address,
      value)

    const registers = createRegisters(this._dataType, value, this._littleEndian)

    switch (this._registerType) {
      case RegisterType.InputRegisters:
        registers.forEach((register, index) => {
          this._serverData[RegisterType.InputRegisters][this._address + index] = register
        })
        break
      case RegisterType.HoldingRegisters:
        registers.forEach((register, index) => {
          this._serverData[RegisterType.HoldingRegisters][this._address + index] = register
        })
        break
    }
  }

  // To be able to rebuild the generators we can so export the parameters
  get params() {
    const params: ValueGeneratorParameters = {
      address: this._address,
      registerType: this._registerType,
      dataType: this._dataType,
      min: this._min,
      max: this._max,
      interval: this._interval,
      littleEndian: this._littleEndian,
      comment: this._comment
    }
    return params
  }
}
