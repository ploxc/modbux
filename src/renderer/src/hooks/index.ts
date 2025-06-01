import { DataType, getMinMaxValues } from '@shared'
import { useMemo } from 'react'

export const useMinMaxInteger = (dataType: DataType) => {
  const integer = useMemo(
    () => ['int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64'].includes(dataType),
    [dataType]
  )
  const { min, max } = useMemo(() => getMinMaxValues(dataType), [dataType])

  return { integer, min, max }
}
