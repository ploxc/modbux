import { maxReadQuantity, maxUnitId } from '@shared'
import {
  selectedClient,
  selectedClientUuid,
  useClientZustand
} from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { useScanUnitIdZustand } from './scanUnitIds.zustand'

/** Scan the unit ids of the client on screen with what the dialog holds, as its Start button does. */
export const startUnitIdScan = (): void => {
  const scanUnitIdZustand = useScanUnitIdZustand.getState()
  const liveZustand = useLiveZustand.getState()
  const uuid = selectedClientUuid()
  liveZustand.clearScanUnitIdResults(uuid)
  liveZustand.setScanProgress(uuid, 0)

  const { address, length, startUnitId, count, registerTypes, timeout } = scanUnitIdZustand
  const lastUnitId = maxUnitId(
    selectedClient(useClientZustand.getState()).connectionConfig.protocol
  )

  // Clamped where the request is built rather than left to the boundary,
  // because the boundary refuses what it is given and the results are already
  // cleared by then.
  //
  // Each field masks to its own ceiling and the request is bounded by a pair:
  // Start caps at 255 and Count at 256, so 200 and 100 name unit id 299, and
  // over RTU the last unit id is 247, past which the button is disabled. The
  // length is the mask's, measured: selecting another register type rewrites
  // the mounted field, and 2000 typed under coils reads 125 under holding
  // registers. `maxReadQuantity` restates that bound here.
  //
  // The floors are here as well as on each field's blur, because Escape
  // closes the dialog and the field unmounts without one, leaving the
  // `Number('') === 0` of a cleared field in the store.
  window.api.scanUnitIds({
    uuid: selectedClientUuid(),
    parameters: {
      address,
      length: Math.min(Math.max(1, length), maxReadQuantity(registerTypes)),
      range: [startUnitId, Math.min(lastUnitId, startUnitId + Math.max(1, count) - 1)],
      registerTypes,
      timeout
    }
  })
}
