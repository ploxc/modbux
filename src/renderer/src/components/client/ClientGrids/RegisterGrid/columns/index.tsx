import { GridColDef } from '@mui/x-data-grid'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterData } from '@shared'
import { useMemo } from 'react'
import { addressColumn } from './address'
import { conventionalAddresColumn } from './conventionalAddress'
import { bitColumn } from './bit'
import { dataTypeColumn } from './dataType'
import { convertedValueColumn } from './convertedValue'
import { scalingFactorColumn } from './scalingFactor'
import { hexColumn } from './hex'
import { binaryColumn } from './binary'
import { valueColumn } from './value'
import { commentColumn } from './comment'
import { writeActionColumn } from './write'
import { interpolationColumn } from './interpolation'
import { groupEndColumn } from './groupEnd'
import { useLayoutZustand } from '@renderer/context/layout.zustand'

//
//
// COLUMNS
const useRegisterGridColumns = () => {
  const type = useRootZustand((z) => z.registerConfig.type)
  const registerMap = useRootZustand((z) => z.registerMapping[type])

  const addressBase = useRootZustand((z) => z.registerConfig.addressBase)
  const advanced = useRootZustand((z) => z.registerConfig.advancedMode)
  const show64Bit = useRootZustand((z) => z.registerConfig.show64BitValues)

  const address = useRootZustand((z) => z.registerConfig.address)
  const length = useRootZustand((z) => z.registerConfig.length)

  const showRaw = useLayoutZustand((z) => z.showClientRawValues)

  return useMemo(() => {
    const registers16Bit = ['input_registers', 'holding_registers'].includes(type)

    const showConventionalAddress = Number(address) + length < 10000

    const columns: GridColDef<RegisterData>[] = [addressColumn]
    if (showConventionalAddress || addressBase === '1') {
      columns.push(conventionalAddresColumn(type, addressBase, showConventionalAddress))
    }

    if (!registers16Bit) {
      columns.push(bitColumn)
    }

    if (registers16Bit) {
      columns.push(
        dataTypeColumn(registerMap),
        convertedValueColumn(registerMap, showRaw),
        scalingFactorColumn(registerMap, type),
        interpolationColumn(type),
        groupEndColumn(registerMap),
        hexColumn,
        binaryColumn
      )
    }

    // Advanced mode columns
    if (advanced && registers16Bit) {
      columns.push(
        valueColumn('int16', 70),
        valueColumn('uint16', 70),
        valueColumn('int32', 100),
        valueColumn('uint32', 100),
        valueColumn('float', 100)
      )
    }

    // Show 64 bit columns only in advanced mode, these are not very common, but they are there
    if (advanced && show64Bit && registers16Bit) {
      columns.push(
        valueColumn('int64', 160),
        valueColumn('uint64', 160),
        valueColumn('double', 160)
      )
    }

    columns.push(commentColumn(registerMap))

    if (['coils', 'holding_registers'].includes(type)) {
      columns.push(writeActionColumn(type))
    }

    return columns
  }, [type, addressBase, advanced, show64Bit, registerMap, address, length, showRaw])
}

export default useRegisterGridColumns
