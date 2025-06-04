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
    let addressesToReset: number[]
    if (['int16', 'uint16'].includes(this._dataType)) {
      addressesToReset = [this._address]
    } else if (['uint32', 'int32', 'float'].includes(this._dataType)) {
      addressesToReset = [this._address, this._address + 1]
    } else {
      // e.g. double, 64-bit types
      addressesToReset = [this._address, this._address + 1, this._address + 2, this._address + 3]
    }

    addressesToReset.forEach((address) => {
      this._serverData[this._registerType][address] = 0
    })
  }

  /**
   * Updates the value in the server data and notifies the frontend.
   * @param value - The new value to write to the register(s).
   */
  private _updateServerData = (value: number): void => {
    const registers = createRegisters(this._dataType, value, this._littleEndian)

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
   * Uses 2 decimals for float/double, 0 otherwise.
   */
  private _updateValue = async (): Promise<void> => {
    const decimals = ['float', 'double'].includes(this._dataType) ? 2 : 0
    const value = round(Math.random() * (this._max - this._min) + this._min, decimals)
    this._updateServerData(value)
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
      littleEndian: this._littleEndian,
      comment: this._comment
    }
  }
}
