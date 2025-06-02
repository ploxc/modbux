import { DataType, getMinMaxValues } from '@shared'
import { useMemo } from 'react'

type UseMinMaxIntegerFn = (
  dataType: DataType,
  limit?: 'min' | 'max',
  value?: string | number
) => { integer: boolean; min: number; max: number }

export const useMinMaxInteger: UseMinMaxIntegerFn = (dataType, limit, value) => {
  const integer = useMemo(
    () => ['int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'].includes(dataType),
    [dataType]
  )
  const { min, max } = useMemo(() => getMinMaxValues(dataType), [dataType])

  const minSafe =
    limit === 'min' && value !== undefined && min > Number(value) ? Number(value) : min
  const maxSafe =
    limit === 'max' && value !== undefined && max < Number(value) ? Number(value) : max

  return { integer, min: minSafe, max: maxSafe }
}
