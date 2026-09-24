import type { ClientSession, ClientZustand, PersistedClient } from '../client.zustand.types'
import { getDefaultClient, readySession } from '../client.zustand.helpers'

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
