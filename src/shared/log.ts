import { groupEntries, groupPoll, isConfiguredAddress } from './addressGrouping'
import {
  AddressGroup,
  ClientUnit,
  DataType,
  LogPoint,
  RegisterData,
  RegisterDataWords,
  RegisterMapping,
  RegisterMapValue,
  RegisterType,
  isBooleanRegister,
  RegisterTypeSchema
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

/** How many registers of `units` log. */
export const loggedRegisterCount = (units: readonly ClientUnit[]): number =>
  units.reduce(
    (count, unit) =>
      count +
      RegisterTypeSchema.options.reduce(
        (inType, type) =>
          inType +
          Object.values(unit.registerMapping[type]).filter((mapValue) => isLogged(type, mapValue))
            .length,
        0
      ),
    0
  )

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

/**
 * Whether Monitor's poll round reads `group` of `type`: while its Poll is on or
 * mixed, and while `logging`, also off when a register in it logs.
 */
export const monitorReadsGroup = (
  type: RegisterType,
  registerMapping: RegisterMapping | undefined,
  group: AddressGroup,
  logging: boolean
): boolean =>
  groupPoll(type, registerMapping, group) !== 'off' ||
  (logging &&
    groupEntries(type, registerMapping, group).some(([, mapValue]) => isLogged(type, mapValue)))

/**
 * `points`, in time order, as stretches of `step` milliseconds from the epoch
 * on: each stretch's lowest and highest value, its first failed read and its
 * newest sample, in time order. A chart of hours draws its peaks, its gaps and
 * where each line ends from a few points a pixel.
 */
export const inSteps = (points: readonly LogPoint[], step: number): LogPoint[] => {
  const stepped: LogPoint[] = []
  let stretch: number | undefined
  let lowest: LogPoint | undefined
  let highest: LogPoint | undefined
  let failed: LogPoint | undefined
  let newest: LogPoint | undefined
  const close = (): void => {
    const kept = [...new Set([lowest, highest, failed, newest])].filter(
      (point): point is LogPoint => point !== undefined
    )
    stepped.push(...kept.sort((a, b) => a.time - b.time))
    lowest = highest = failed = newest = undefined
  }
  for (const point of points) {
    const at = Math.floor(point.time / step)
    if (at !== stretch) {
      close()
      stretch = at
    }
    newest = point
    if (point.error !== undefined) {
      failed ??= point
      continue
    }
    if (lowest === undefined || point.value < lowest.value) lowest = point
    if (highest === undefined || point.value > highest.value) highest = point
  }
  close()
  return stepped
}
