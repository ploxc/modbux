import {
  createRegisters,
  NumberRegisters,
  RegisterParamsGeneratorPart,
  RegisterParamsBasePart,
  ServerData,
  BaseDataType,
  RegisterParams,
  UnitIdString
} from '@shared'
import { round } from 'lodash'
import { Windows } from '@shared'

type ValueGeneratorParams = {
  uuid: string
  unitId: UnitIdString
  windows: Windows
  serverData: ServerData
} & RegisterParamsGeneratorPart &
  RegisterParamsBasePart

export class ValueGenerator {
  private _uuid: string
  private _unitId: UnitIdString
  private _windows: Windows
  private _serverData: ServerData
  private _registerType: NumberRegisters
  private _address: number
  private _dataType: BaseDataType
  private _min: number
  private _max: number
  private _littleEndian: boolean
  private _interval: number
  private _comment: string

  private _intervalTimer: NodeJS.Timeout

  constructor({
    uuid,
    unitId,
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
    this._uuid = uuid
    this._unitId = unitId
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

    // Set initial value and the interval so it keeps generating new values
    this._updateValue()
    this._intervalTimer = setInterval(this._updateValue, interval)
  }

  public dispose = (): void => {
    // Clear the interval timer so updateing the value is stopped
    clearInterval(this._intervalTimer)

    // Reset the values in the server data based on the length of the datatype
    const addressesToReset = ['int16', 'uint16'].includes(this._dataType)
      ? [this._address]
      : ['uint32', 'int32', 'float'].includes(this._dataType)
        ? [this._address, this._address + 1]
        : [this._address, this._address + 1, this._address + 2, this._address + 3]

    addressesToReset.forEach((address) => {
      this._serverData[this._registerType][address] = 0
    })
  }

  // Send the value to the front-end
  private _sendValue = (value: number): void => {
    this._windows.send('register_value', {
      uuid: this._uuid,
      unitId: this._unitId,
      registerType: this._registerType,
      address: this._address,
      value
    })
  }

  // Update the value in the serverdata so it can be read by a client
  private _updateServerData = (value: number): void => {
    const registers = createRegisters(this._dataType, value, this._littleEndian)

    switch (this._registerType) {
      case 'input_registers':
        registers.forEach((register, index) => {
          this._serverData['input_registers'][this._address + index] = register
        })
        break
      case 'holding_registers':
        registers.forEach((register, index) => {
          this._serverData['holding_registers'][this._address + index] = register
        })
        break
    }
  }

  private _updateValue = async (): Promise<void> => {
    const decimals = ['float', 'double'].includes(this._dataType) ? 2 : 0
    const value = round(Math.random() * (this._max - this._min) + this._min, decimals)
    this._sendValue(value)
    this._updateServerData(value)
  }

  // To be able to rebuild the generators we can so export the parameters
  get params(): RegisterParams {
    const params: RegisterParams = {
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
