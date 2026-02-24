import {
  createRegisters,
  createStringRegisters,
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
  littleEndian: boolean
} & RegisterParamsGeneratorPart &
  RegisterParamsBasePart

/**
 * ValueGenerator generates and updates Modbus register values at a set interval.
 * It supports various data types and updates the server data and notifies the frontend.
 */
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
  private _stringValue: string
  private _length: number
  private _intervalTimer: NodeJS.Timeout

  /**
   * Constructs a ValueGenerator.
   * @param params - All parameters required for value generation and server data update.
   */
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
    comment,
    stringValue,
    length
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
    this._stringValue = stringValue ?? ''
    this._length = length ?? 10

    // Set initial value and start periodic updates
    this._updateValue()
    this._intervalTimer = setInterval(this._updateValue, interval)
  }

  /**
   * Disposes the generator: stops the interval and resets the register values to 0.
   */
  public dispose = (): void => {
    clearInterval(this._intervalTimer)

    // Determine how many addresses to reset based on data type size
    let size: number
    if (['int16', 'uint16'].includes(this._dataType)) {
      size = 1
    } else if (['uint32', 'int32', 'float', 'unix'].includes(this._dataType)) {
      size = 2
    } else if (['int64', 'uint64', 'double', 'datetime'].includes(this._dataType)) {
      size = 4
    } else if (this._dataType === 'utf8') {
      size = this._length
    } else {
      size = 1
    }

    for (let i = 0; i < size; i++) {
      this._serverData[this._registerType][this._address + i] = 0
    }
  }

  /**
   * Updates the value in the server data and notifies the frontend.
   */
  private _updateServerData = (value: number): void => {
    const registers =
      this._dataType === 'utf8'
        ? createStringRegisters(this._stringValue, this._length)
        : createRegisters(this._dataType, value, this._littleEndian)

    registers.forEach((register, index) => {
      const registerAddress = this._address + index
      this._serverData[this._registerType][registerAddress] = register
      this._windows.send('register_value', {
        uuid: this._uuid,
        unitId: this._unitId,
        registerType: this._registerType,
        address: registerAddress,
        raw: register
      })
    })
  }

  /**
   * Generates a new value and updates the server data.
   */
  private _updateValue = async (): Promise<void> => {
    switch (this._dataType) {
      case 'unix': {
        // Generator: current system time (seconds since epoch)
        this._updateServerData(Math.floor(Date.now() / 1000))
        break
      }
      case 'datetime': {
        // Generator: current system time (milliseconds for IEC 870 encoding)
        this._updateServerData(Date.now())
        break
      }
      case 'utf8': {
        // UTF-8 is always fixed — write once, no periodic changes
        this._updateServerData(0)
        break
      }
      default: {
        // Numeric random value
        const decimals = ['float', 'double'].includes(this._dataType) ? 2 : 0
        const value = round(Math.random() * (this._max - this._min) + this._min, decimals)
        this._updateServerData(value)
      }
    }
  }

  /**
   * Returns the parameters needed to reconstruct this generator.
   */
  get params(): RegisterParams {
    return {
      address: this._address,
      registerType: this._registerType,
      dataType: this._dataType,
      min: this._min,
      max: this._max,
      interval: this._interval,
      comment: this._comment,
      ...(this._dataType === 'utf8' ? { stringValue: this._stringValue, length: this._length } : {})
    }
  }
}
