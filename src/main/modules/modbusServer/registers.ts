import {
  createRegisters,
  createStringRegisters,
  DEFAULT_UTF8_LENGTH,
  NumberRegisters,
  ServerData,
  UnitIdString,
  ValuedDataType
} from '@shared'
import { Windows } from '../../windows'

/**
 * The words a value encodes to, which is not the same question as how many.
 * `registerWidth` answers that one.
 *
 * Two writers reach it: `ModbusServer.addRegister` for a fixed register, and
 * `ValueGenerator` on every tick. One function rather than the pair of encoders
 * spelled out at each, because what two copies do with a throw drifts apart.
 * `ModbusServer._encode` is the `try` around it; the generator calls this bare
 * on purpose, and `addRegister`'s docblock says why.
 *
 * A string is written from its characters rather than from `value`, so `utf8`
 * ignores it.
 */
export const encodeRegisters = ({
  dataType,
  value,
  littleEndian,
  stringValue,
  length
}: {
  dataType: ValuedDataType
  value: number
  littleEndian: boolean
  stringValue?: string
  length?: number
}): number[] =>
  dataType === 'utf8'
    ? createStringRegisters(stringValue ?? '', length ?? DEFAULT_UTF8_LENGTH)
    : createRegisters(dataType, value, littleEndian)

/**
 * Writes `registers` from `address` on and tells the server view each word.
 *
 * One event per register, because the renderer folds a word at a time: the
 * store's `applyRegisterValue` looks back up to three addresses for the entry
 * that owns the one it was handed.
 */
export const writeRegisters = ({
  windows,
  serverData,
  uuid,
  unitId,
  registerType,
  address,
  registers
}: {
  windows: Windows
  serverData: ServerData
  uuid: string
  unitId: UnitIdString
  registerType: NumberRegisters
  address: number
  registers: number[]
}): void => {
  registers.forEach((register, index) => {
    const registerAddress = address + index
    serverData[registerType].set(registerAddress, register)
    windows.send(
      'register_value',
      { uuid, unitId, registerType, address: registerAddress, value: register },
      'serverView'
    )
  })
}
