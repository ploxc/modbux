import { z } from 'zod'

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
