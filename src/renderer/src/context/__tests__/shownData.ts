import { MAIN_CLIENT_UUID } from '@shared'
import type { ClientData, DataZustand } from '../data.zustand.types'
import { dataOf, emptyClientData } from '../data.zustand.helpers'

/** The two calls of the data store this needs, so a test hands over the one it loaded. */
interface DataStore {
  getState: () => DataZustand
  setState: (partial: Partial<DataZustand>) => void
}

/**
 * The data of the client a test's view shows, which is `MAIN_CLIENT_UUID` until
 * the test selects another. The store is an argument for the reason
 * `patchSelectedClient` gives.
 */
export const shownData = (store: DataStore, uuid: string = MAIN_CLIENT_UUID): ClientData =>
  dataOf(store.getState(), uuid)

/** Write fields into that client's data, and leave the rest where the test found it. */
export const patchShownData = (
  store: DataStore,
  data: Partial<ClientData>,
  uuid: string = MAIN_CLIENT_UUID
): void => {
  const { clients } = store.getState()
  store.setState({
    clients: { ...clients, [uuid]: { ...(clients[uuid] ?? emptyClientData()), ...data } }
  })
}
