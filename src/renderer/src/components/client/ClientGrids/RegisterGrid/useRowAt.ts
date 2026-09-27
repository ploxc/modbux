import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { rowAt, useLiveZustand } from '@renderer/context/live.zustand'
import { RegisterData } from '@shared'

/**
 * The row read at `address` in the section this is drawn in. The grid's own
 * rows carry no values while no value filter is set, so a cell that shows a
 * value reads it here, and renders when that row changes rather than when any
 * row does.
 */
export const useRowAt = (address: number): RegisterData | undefined => {
  const type = useSectionType()
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  return useLiveZustand((z) => rowAt(z, selectedUuid, unit, type, address))
}
