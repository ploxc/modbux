import { sectionOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { GridColDef } from '@mui/x-data-grid/models'
import {
  selectedClient,
  selectedUnit,
  useClientZustand,
  readsConfiguration
} from '@renderer/context/client.zustand'
import { RegisterData, isNumberRegister } from '@shared'
import { useMemo } from 'react'
import { addressColumn } from './address'
import { bitColumn } from './bit'
import { dataTypeColumn } from './dataType'
import { conversionColumn } from './conversion/conversionColumn'
import { unitColumn } from './unit'
import { logColumn } from './log/logColumn'
import { hexColumn } from './hex'
import { binaryColumn } from './binary'
import { valueColumn } from './value'
import { commentColumn } from './comment'
import { writeActionColumn } from './write'
import { groupEndColumn } from './groupEnd'
import { groupIndexColumn } from './groupIndex'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { bitmapValueColumn } from './bitmapValueColumn'

//
//
// COLUMNS
const useRegisterGridColumns = (): GridColDef<RegisterData>[] => {
  const type = useSectionType()
  const registerMap = useClientZustand((z) => selectedUnit(z).registerMapping[type])

  const addressBase = useClientZustand((z) => selectedUnit(z).addressBase)
  const advanced = useClientZustand((z) => selectedClient(z).registerConfig.advancedMode)
  const show64Bit = useClientZustand((z) => selectedClient(z).registerConfig.show64BitValues)

  const readConfiguration = useClientZustand((z) => readsConfiguration(z))
  const showRaw = useLayoutZustand((z) => z.showClientRawValues)
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const addressGroups = useLiveZustand((z) => sectionOf(z, selectedUuid, unit, type).addressGroups)

  return useMemo(() => {
    const registers16Bit = isNumberRegister(type)

    const columns: GridColDef<RegisterData>[] = [addressColumn(addressBase)]

    if (readConfiguration) {
      columns.push(groupIndexColumn)
    }

    if (!registers16Bit) {
      columns.push(bitColumn, logColumn)
    }

    if (registers16Bit) {
      columns.push(
        dataTypeColumn(registerMap),
        bitmapValueColumn(registerMap, showRaw, addressGroups),
        conversionColumn,
        unitColumn(registerMap),
        logColumn,
        groupEndColumn(registerMap),
        hexColumn,
        binaryColumn
      )
    }

    if (advanced && registers16Bit) {
      columns.push(
        valueColumn('int16', 70),
        valueColumn('uint16', 70),
        valueColumn('int32', 100),
        valueColumn('uint32', 100),
        valueColumn('float', 100)
      )
    }

    if (show64Bit && registers16Bit) {
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
  }, [
    type,
    addressBase,
    advanced,
    show64Bit,
    registerMap,
    showRaw,
    readConfiguration,
    addressGroups
  ])
}

export default useRegisterGridColumns
