import { DataType, getMinMaxValues } from '@shared'
import { useMemo } from 'react'

export const useMinMaxInteger = (dataType: DataType) => {
  const integer = useMemo(
    () =>
      [
        DataType.Int16,
        DataType.UInt16,
        DataType.Int32,
        DataType.UInt32,
        DataType.Int64,
        DataType.UInt64
      ].includes(dataType),
    [dataType]
  )
  const { min, max } = useMemo(() => getMinMaxValues(dataType), [dataType])

  return { integer, min, max }
}
