import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { AddressGroup, RegisterType } from '@shared'
import { createContext, useContext, useMemo } from 'react'

/**
 * Where the write dialog writes, and the addresses its coil picker offers.
 *
 * Debug provides none, and the dialog writes the selected unit's section with
 * the toolbar's window. Monitor provides the unit and type of the group the
 * write was pressed in, with the group as the window, and its rows are Monitor's.
 */
export interface WriteTarget {
  uuid: string
  unit: string
  type: RegisterType
  window: AddressGroup
  monitor: boolean
}

export const WriteTargetContext = createContext<WriteTarget | undefined>(undefined)

/** The target the dialog was opened in. */
export const useWriteTarget = (): WriteTarget => {
  const given = useContext(WriteTargetContext)
  const type = useSectionType()
  const uuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const address = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const length = useClientZustand((z) => selectedUnit(z).sections[type].length)
  return useMemo(
    () => given ?? { uuid, unit, type, window: [address, length], monitor: false },
    [given, uuid, unit, type, address, length]
  )
}
