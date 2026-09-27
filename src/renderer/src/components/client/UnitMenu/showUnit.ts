import { useClientZustand } from '@renderer/context/client.zustand'

/**
 * Shows this client and this unit. Answers whether both are on screen after,
 * which they are not while the selection is held.
 */
export const showUnit = (uuid: string, unit: string): boolean => {
  const clientZustand = useClientZustand.getState()
  clientZustand.setSelectedUuid(uuid)
  if (useClientZustand.getState().selectedUuid !== uuid) return false
  clientZustand.selectUnit(unit)
  return true
}
