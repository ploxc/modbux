import z from 'zod'

export const BaseDataTypeSchema = z.enum([
  'none',
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double',
  'unix',
  'datetime',
  'utf8',
  'bitmap'
])
export type BaseDataType = z.infer<typeof BaseDataTypeSchema>

// DataType is identical to BaseDataType (all types are now simulatable)
export const DataTypeSchema = BaseDataTypeSchema
export type DataType = z.infer<typeof DataTypeSchema>

/**
 * A data type a register can be given a value for.
 *
 * `none` is an address held open with nothing in it, and it reaches a register
 * map only from a config file. `createRegisters` had no case for it, so it fell
 * through to one register of zero, and a generator on one wrote that zero on
 * every tick.
 */
export type ValuedDataType = Exclude<DataType, 'none'>

/**
 * The types a scaling factor and a linear interpolation apply to.
 *
 * Three places in the register grid ask this and have to agree: whether the
 * Scale cell can be edited, whether its value is shown, and whether the Σ
 * button is live. `unix`, `datetime` and `bitmap` hold a number the grid does
 * not show as one, and `utf8` and `none` hold no number at all.
 */
export const scalableDataTypes: readonly DataType[] = [
  'int16',
  'uint16',
  'int32',
  'uint32',
  'int64',
  'uint64',
  'float',
  'double'
]

/**
 * What `createRegisters` encodes.
 *
 * A string is the other writer, `createStringRegisters`, because its width is
 * the one the user chose rather than the one the type has. Asking
 * `createRegisters` for a utf8 wrote one register of zero over the string.
 */
export type EncodableDataType = Exclude<ValuedDataType, 'utf8'>
