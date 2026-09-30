import { useLogEnabled } from '@renderer/components/client/Logging/useLogEnabled'
import { selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { configuredReadGroups, groupEntries, monitorReadsGroup, RegisterType } from '@shared'
import { useMemo } from 'react'

const NO_ADDRESSES = new Set<number>()

/**
 * The addresses of `type` whose group Monitor does not read while logging:
 * its Poll off, and no register in it logging. Each group walks the whole
 * mapping, so they are found when the mapping changes rather than on every
 * render, and not at all while logging is off.
 */
export const useMonitorOff = (type: RegisterType): Set<number> => {
  const logEnabled = useLogEnabled()
  const registerMapping = useClientZustand((z) => selectedUnit(z).registerMapping)
  return useMemo(
    () =>
      logEnabled
        ? new Set(
            configuredReadGroups(true, type, registerMapping)
              .filter((group) => !monitorReadsGroup(type, registerMapping, group, true))
              .flatMap((group) =>
                groupEntries(type, registerMapping, group).map(([address]) => address)
              )
          )
        : NO_ADDRESSES,
    [logEnabled, type, registerMapping]
  )
}
