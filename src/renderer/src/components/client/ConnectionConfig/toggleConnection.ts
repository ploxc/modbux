import { useSerialGroupZustand } from '@renderer/components/client/SerialGroupModal/serialGroupModal.zustand'
import {
  getSelectedClient,
  readsConfiguration,
  selectedClientUuid,
  useClientZustand
} from '@renderer/context/client.zustand'
import { getShownData, setShownRegisterData } from '@renderer/context/live.zustand'

/** Connects the selected client, or disconnects it while it connects or is connected. */
export const toggleConnection = async (): Promise<void> => {
  const currentConnectedState = getShownData().clientState.connectState
  if (['connecting', 'connected'].includes(currentConnectedState)) {
    window.api.disconnect(selectedClientUuid())
    if (!readsConfiguration(useClientZustand.getState())) setShownRegisterData([])
    return
  }

  if (currentConnectedState === 'disconnected') {
    // On RTU the port can be there and still refuse to open. Ask first and
    // say why, rather than let the connect fail on a permission error.
    if (getSelectedClient().connectionConfig.protocol === 'ModbusRtu') {
      const blocked = await useSerialGroupZustand.getState().check({ force: true })
      if (blocked) return
    }
    window.api.connect(selectedClientUuid())
  }
}
