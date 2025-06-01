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
  'double'
])
export type BaseDataType = z.infer<typeof BaseDataTypeSchema>

export const DataTypeSchema = z.enum([...BaseDataTypeSchema.options, 'unix', 'datetime', 'utf8'])
export type DataType = z.infer<typeof DataTypeSchema>
