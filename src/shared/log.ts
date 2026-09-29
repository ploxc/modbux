import { isConfiguredAddress } from './addressGrouping'
import {
  DataType,
  RegisterData,
  RegisterDataWords,
  RegisterMapValue,
  RegisterType,
  isBooleanRegister
} from './types'

/**
 * The number a log keeps for each data type that has one. A text, and the two
 * timestamps a register decodes to a string, have no value to draw on a chart.
 * A bitmap logs its word, which the bitfield timeline splits into its bits. A
 * 64 bit word becomes the nearest double, exact up to 2^53.
 */
const LOGGED_WORDS: Partial<Record<DataType, (words: RegisterDataWords) => number>> = {
  int16: (words) => words.int16,
  uint16: (words) => words.uint16,
  int32: (words) => words.int32,
  uint32: (words) => words.uint32,
  int64: (words) => Number(words.int64),
  uint64: (words) => Number(words.uint64),
  float: (words) => words.float,
  double: (words) => words.double,
  bitmap: (words) => words.uint16
}

/**
 * Whether a register can log: it is in the read configuration, which is what
 * a logging client reads, and a bit or a number.
 */
export const isLoggable = (
  type: RegisterType,
  mapValue: RegisterMapValue | undefined
): mapValue is RegisterMapValue =>
  isConfiguredAddress(type, mapValue) &&
  (isBooleanRegister(type) ||
    (mapValue.dataType !== undefined && LOGGED_WORDS[mapValue.dataType] !== undefined))

/** Whether a register logs: it can, and its mapping says so. */
export const isLogged = (type: RegisterType, mapValue: RegisterMapValue | undefined): boolean =>
  mapValue?.log !== undefined && isLoggable(type, mapValue)

/**
 * The number a log keeps for a row, before the conversion: 1 or 0 for a bit.
 * Nothing for a row whose read failed, which carries a 0 it did not read.
 */
export const loggedValue = (
  type: RegisterType,
  dataType: DataType | undefined,
  row: RegisterData
): number | undefined => {
  if (row.error !== undefined) return undefined
  if (isBooleanRegister(type)) return row.bit ? 1 : 0
  const word = dataType === undefined ? undefined : LOGGED_WORDS[dataType]
  return word && row.words ? word(row.words) : undefined
}
