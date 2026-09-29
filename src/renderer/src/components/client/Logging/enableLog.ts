import { useClientZustand } from '@renderer/context/client.zustand'

/**
 * Switch logging on for the client under `uuid`, after the samples the log
 * holds or in an empty log. Read configuration goes on for every unit first:
 * while the log is on Monitor polls, and Debug shows Monitor's reads over the
 * mapping.
 */
export const enableLog = (uuid: string, append: boolean): void => {
  const clientZustand = useClientZustand.getState()
  clientZustand.readConfigurationForLog(uuid)
  void window.api.startLog({ uuid, append })
}
