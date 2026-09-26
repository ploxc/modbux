import { MAIN_CLIENT_UUID, RegisterType } from '@shared'
import type { ClientData, LiveZustand, SectionData } from '../live.zustand.types'
import { dataOf, emptyClientData, sectionKey, sectionOf } from '../live.zustand.helpers'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'

/** The two calls of the live store this needs, so a test hands over the one it loaded. */
interface DataStore {
  getState: () => LiveZustand
  setState: (partial: Partial<LiveZustand>) => void
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

/** Where a test's rows are: the default client's one unit, its holding registers. */
export interface SectionAt {
  uuid?: string
  unit?: string
  type?: RegisterType
}

/** The rows and groups of one section, the default client's holding registers unless named. */
export const shownSectionData = (
  store: DataStore,
  { uuid = MAIN_CLIENT_UUID, unit = MAIN_UNIT_UUID, type = 'holding_registers' }: SectionAt = {}
): SectionData => sectionOf(store.getState(), uuid, unit, type)

/** Write fields into one section's data, and leave the rest where the test found it. */
export const patchShownSection = (
  store: DataStore,
  section: Partial<SectionData>,
  { uuid = MAIN_CLIENT_UUID, unit = MAIN_UNIT_UUID, type = 'holding_registers' }: SectionAt = {}
): void => {
  const data = dataOf(store.getState(), uuid)
  const key = sectionKey(unit, type)
  patchShownData(
    store,
    {
      sections: {
        ...data.sections,
        [key]: { ...sectionOf(store.getState(), uuid, unit, type), ...section }
      }
    },
    uuid
  )
}
