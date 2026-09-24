import {
  defaultConnectionConfig,
  defaultRegisterConfig,
  emptyRegisterMapping,
  isConnectionAddressGiven,
  isReadLengthGiven,
  MAIN_CLIENT_UUID,
  readsNothing,
  repairPersisted
} from '@shared'
import {
  ClientSession,
  PersistedClient,
  PersistedClientSchema,
  PersistedClientZustand
} from './client.zustand.types'

/** A client with the default config, which is what a new one and a repair start from. */
export const getDefaultClient = (): PersistedClient => ({
  name: '',
  connectionConfig: structuredClone(defaultConnectionConfig),
  registerConfig: structuredClone(defaultRegisterConfig),
  registerMapping: emptyRegisterMapping()
})

/**
 * The session a client has once main holds its config.
 *
 * `valid` is read off the values, because the host, COM and length fields
 * keep a value they refuse in the store rather than sending it, and disk
 * carries the value and not the flag: a blank COM port typed before a quit
 * came back with the flag reading true, and Connect took a press on it.
 */
export const readySession = (client: PersistedClient): ClientSession => ({
  ready: true,
  readConfiguration: false,
  valid: {
    host: isConnectionAddressGiven(client.connectionConfig.tcp.host),
    com: isConnectionAddressGiven(client.connectionConfig.rtu.com),
    length: isReadLengthGiven(client.registerConfig.length)
  }
})

/**
 * What a selector reads where the selected uuid holds nothing: a client with
 * the default config, and a session main does not have yet.
 *
 * One object each for the life of the module, so a selector reading through
 * them answers the same reference on every read, which is what zustand
 * compares. `repairClients` keeps the selected uuid on a client, so what
 * reaches these is a state set another way.
 */
const NO_CLIENT: PersistedClient = getDefaultClient()
const NO_SESSION: ClientSession = {
  ready: false,
  readConfiguration: false,
  valid: { host: true, com: true, length: true }
}

type Selection = Pick<PersistedClientZustand, 'selectedUuid' | 'clients'>

/** The client the view shows. */
export const selectedClient = (state: Selection): PersistedClient =>
  state.clients[state.selectedUuid] ?? NO_CLIENT

/** The session of the client the view shows. */
export const selectedSession = (
  state: Pick<PersistedClientZustand, 'selectedUuid'> & { sessions: Record<string, ClientSession> }
): ClientSession => state.sessions[state.selectedUuid] ?? NO_SESSION

/**
 * Whether a read of `uuid` would ask for no registers, which main refuses:
 * the question `readsNothing` asks, of that client's config and its Length
 * field's flag.
 */
export const readsNothingOf = (
  state: Pick<PersistedClientZustand, 'clients'> & { sessions: Record<string, ClientSession> },
  uuid: string
): boolean => {
  const client = state.clients[uuid] ?? NO_CLIENT
  const session = state.sessions[uuid] ?? NO_SESSION
  return readsNothing(
    session.readConfiguration,
    client.registerConfig.type,
    client.registerMapping,
    session.valid.length
  )
}

/**
 * The clients read back one at a time, field by field, and a selected uuid
 * that names one of them.
 *
 * `repairPersisted` works a top level field at a time, and `clients` is one
 * field holding every client, so read whole, one register the schema refuses
 * would cost every client's config. A store with no client left gets the
 * default one under `MAIN_CLIENT_UUID`, because the view always shows one.
 * Undefined for a `clients` that is not a record, which the store's own
 * repair then answers with the default.
 */
export const repairClients = (
  state: Selection
): { selection: Selection; fields: string[] } | undefined => {
  const { clients } = state
  if (typeof clients !== 'object' || clients === null || Array.isArray(clients)) return undefined

  const repaired: Record<string, PersistedClient> = {}
  const fields = new Set<string>()
  for (const [uuid, client] of Object.entries(clients)) {
    const repair = repairPersisted(PersistedClientSchema, client, getDefaultClient())
    repaired[uuid] = repair.state
    for (const field of repair.reset?.fields ?? []) fields.add(field)
  }

  const [first] = Object.keys(repaired)
  if (first === undefined) {
    repaired[MAIN_CLIENT_UUID] = getDefaultClient()
    fields.add('clients')
  }
  const selectedUuid = Object.hasOwn(repaired, state.selectedUuid)
    ? state.selectedUuid
    : (first ?? MAIN_CLIENT_UUID)

  return { selection: { selectedUuid, clients: repaired }, fields: [...fields] }
}
