import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'

/** Whether logging is on for the selected client, and so whether Monitor polls it. */
export const useLogEnabled = (): boolean => {
  const uuid = useClientZustand((z) => z.selectedUuid)
  return useLiveZustand((z) => dataOf(z, uuid).clientState.log.enabled)
}
