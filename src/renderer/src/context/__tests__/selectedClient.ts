import type { ClientSection, ClientUnit } from '@shared'
import type { ClientSession, ClientZustand, PersistedClient } from '../client.zustand.types'
import { getDefaultClient, readySession, unitOf } from '../client.zustand.helpers'

/** The two calls of a zustand store this needs, so a test hands over the one it loaded. */
interface ClientStore {
  getState: () => ClientZustand
  setState: (partial: Partial<ClientZustand>) => void
}

/**
 * Write fields into the client the store shows, and into its session, and
 * leave everything else where the test found it.
 *
 * The store holds its clients in a record under a uuid, so a test that sets
 * `ready` or a register config sets it on the selected one. A client or a
 * session the store has not made yet starts from what `init` would make. The
 * store is an argument rather than an import, because a test that stubs the
 * window first loads the store after, and an import here would load it before.
 */
export const patchSelectedClient = (
  store: ClientStore,
  client: Partial<PersistedClient> = {},
  session: Partial<ClientSession> = {}
): void => {
  const state = store.getState()
  const uuid = state.selectedUuid
  const current = state.clients[uuid] ?? getDefaultClient()
  const currentSession = state.sessions[uuid] ?? readySession(current)
  store.setState({
    clients: { ...state.clients, [uuid]: { ...current, ...client } },
    sessions: { ...state.sessions, [uuid]: { ...currentSession, ...session } }
  })
}

/**
 * Write fields into the unit the store shows, and into the section of the
 * register type it shows, and leave everything else where the test found it.
 * The store is an argument for the reason `patchSelectedClient` gives.
 */
export const patchSelectedUnit = (
  store: ClientStore,
  unit: Partial<ClientUnit> = {},
  section: Partial<ClientSection> = {}
): void => {
  const state = store.getState()
  const uuid = state.selectedUuid
  const client = state.clients[uuid] ?? getDefaultClient()
  const session = state.sessions[uuid] ?? readySession(client)
  const shown = unitOf(client, session)
  const type = session.shownType
  const changed: ClientUnit = {
    ...shown,
    ...unit,
    sections: {
      ...shown.sections,
      ...unit.sections,
      [type]: { ...(unit.sections ?? shown.sections)[type], ...section }
    }
  }
  patchSelectedClient(
    store,
    { units: client.units.map((each) => (each.uuid === shown.uuid ? changed : each)) },
    { selectedUnit: shown.uuid }
  )
}
