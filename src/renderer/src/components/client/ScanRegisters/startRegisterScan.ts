import { MAX_REGISTER_ADDRESS } from '@shared'
import {
  getSelectedClient,
  selectedClientUuid,
  useClientZustand
} from '@renderer/context/client.zustand'
import { dropPendingScanRows, useLiveZustand } from '@renderer/context/live.zustand'
import { useScanRegistersZustand } from './scanRegisters.zustand'

/**
 * Scan the client on screen with what the dialog holds, as its Start button
 * does. It answers when the scan ends.
 */
export const startRegisterScan = async (): Promise<void> => {
  const scanRegistersZustand = useScanRegistersZustand.getState()
  const clientZustand = useClientZustand.getState()
  const liveZustand = useLiveZustand.getState()
  clientZustand.setReadConfiguration(false)
  // A scan walks raw addresses, which is what the extra columns are for, and
  // the rows land in a grid you are now watching fill.
  if (!getSelectedClient().registerConfig.advancedMode) clientZustand.setAdvancedMode(true)
  const uuid = selectedClientUuid()
  liveZustand.setScanProgress(uuid, 0)
  dropPendingScanRows(uuid)
  liveZustand.setRegisterData(uuid, [])

  const { address, scanLength, chunkSize, timeout } = scanRegistersZustand

  // Clamped where the request is built rather than left to the boundary. Read
  // configuration is off and the grid is empty by the time the boundary
  // answers, and `advancedMode` is persisted, so that write outlives the
  // launch.
  //
  // Address and Length each stop at 65535, so 60000 and 10000 name address
  // 69999, which `RegisterAddressSchema` refuses.
  //
  // The floors are here as well as on each field's blur, because Escape
  // closes the dialog and the field unmounts without one, leaving the
  // `Number('') === 0` of a cleared field in the store. A length of none
  // gives a range ending before it starts, which the schema takes and the
  // scan loop never enters.
  await window.api.scanRegisters({
    uuid: selectedClientUuid(),
    parameters: {
      addressRange: [
        address,
        Math.min(MAX_REGISTER_ADDRESS, address + Math.max(1, scanLength) - 1)
      ],
      length: Math.max(1, chunkSize),
      timeout
    }
  })
}
