import {
  ClientSection,
  ClientUnit,
  ClientUnitSchema,
  defaultConnectionConfig,
  defaultRegisterConfig,
  isConnectionAddressGiven,
  isReadLengthGiven,
  MAIN_CLIENT_UUID,
  newClientUnit,
  readsNothing,
  RegisterType,
  RegisterTypeSchema,
  repairPersisted,
  LayoutNode,
  parseLayout,
  typesIn
} from '@shared'
import { v4 } from 'uuid'
import {
  ClientSession,
  PersistedClient,
  PersistedClientSchema,
  PersistedClientZustand
} from './client.zustand.types'

/** The uuid the default client's one unit is created under. */
export const MAIN_UNIT_UUID = 'c3a1bd62-9d7e-4e8e-9d3e-5b0f6f1f0a01'

/**
 * A client with the default config and one unit, unit id 1, which is what a
 * new one and a repair start from. `unit` names the unit; the default client
 * of a fresh store takes `MAIN_UNIT_UUID`.
 */
export const getDefaultClient = (unit: string = v4()): PersistedClient => ({
  name: '',
  connectionConfig: structuredClone(defaultConnectionConfig),
  registerConfig: structuredClone(defaultRegisterConfig),
  units: [newClientUnit(unit, 1)]
})

/**
 * The session a client has once main holds its config: its first unit
 * selected, holding registers shown.
 *
 * `valid` is read off the values, because the host and COM fields keep a
 * value they refuse in the store rather than sending it, and disk carries the
 * value and not the flag: a blank COM port typed before a quit came back with
 * the flag reading true, and Connect took a press on it.
 */
export const readySession = (client: PersistedClient): ClientSession => ({
  ready: true,
  selectedUnit: client.units[0]?.uuid ?? '',
  shownType: 'holding_registers',
  readConfiguration: {},
  removedPlaces: {},
  valid: {
    host: isConnectionAddressGiven(client.connectionConfig.tcp.host),
    com: isConnectionAddressGiven(client.connectionConfig.rtu.com)
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
const NO_CLIENT: PersistedClient = getDefaultClient(MAIN_UNIT_UUID)
const NO_SESSION: ClientSession = {
  ready: false,
  selectedUnit: '',
  shownType: 'holding_registers',
  readConfiguration: {},
  removedPlaces: {},
  valid: { host: true, com: true }
}
const [NO_UNIT = newClientUnit(MAIN_UNIT_UUID, 1)] = NO_CLIENT.units

type Selection = Pick<PersistedClientZustand, 'selectedUuid' | 'clients'>
type WithSessions = Selection & { sessions: Record<string, ClientSession> }

/** The client the view shows. */
export const selectedClient = (state: Selection): PersistedClient =>
  state.clients[state.selectedUuid] ?? NO_CLIENT

/** The session of the client the view shows. */
export const selectedSession = (
  state: Pick<PersistedClientZustand, 'selectedUuid'> & { sessions: Record<string, ClientSession> }
): ClientSession => state.sessions[state.selectedUuid] ?? NO_SESSION

/**
 * The unit of `client` that `session` selects, or its first where the
 * selection names none of them. A client has at least one unit.
 */
export const unitOf = (client: PersistedClient, session: ClientSession): ClientUnit =>
  client.units.find((unit) => unit.uuid === session.selectedUnit) ?? client.units[0] ?? NO_UNIT

/** The unit the view shows. */
export const selectedUnit = (state: WithSessions): ClientUnit =>
  unitOf(selectedClient(state), selectedSession(state))

/** The layout of `unit`, its default where the string names none. */
export const layoutOf = (unit: ClientUnit): LayoutNode =>
  parseLayout(unit.layout) ?? 'holding_registers'

/** The register types the unit on screen shows, in the order its layout draws them. */
export const openTypesOf = (state: WithSessions): RegisterType[] =>
  typesIn(layoutOf(selectedUnit(state)))

/** The register type the view shows. */
export const shownType = (state: WithSessions): RegisterType => selectedSession(state).shownType

/** The read window of the register type the view shows, on the unit it shows. */
export const shownSection = (state: WithSessions): ClientSection =>
  selectedUnit(state).sections[shownType(state)]

/** Whether read configuration is on for the unit the view shows. */
export const readsConfiguration = (state: WithSessions): boolean =>
  selectedSession(state).readConfiguration[selectedUnit(state).uuid] ?? false

/**
 * Whether a read of the register type `uuid` shows, on the unit it shows,
 * would ask for no registers, which main refuses: the question `readsNothing`
 * asks, of that unit's mapping and window.
 */
export const readsNothingOf = (
  state: Pick<PersistedClientZustand, 'clients'> & { sessions: Record<string, ClientSession> },
  uuid: string
): boolean => readsNothingIn(state, uuid, (state.sessions[uuid] ?? NO_SESSION).shownType)

/** The same question of `type` on the unit `uuid` shows, which a section asks of itself. */
export const readsNothingIn = (
  state: Pick<PersistedClientZustand, 'clients'> & { sessions: Record<string, ClientSession> },
  uuid: string,
  type: RegisterType
): boolean => {
  const client = state.clients[uuid] ?? NO_CLIENT
  const session = state.sessions[uuid] ?? NO_SESSION
  const unit = unitOf(client, session)
  return readsNothing(
    session.readConfiguration[unit.uuid] ?? false,
    type,
    unit.registerMapping,
    isReadLengthGiven(unit.sections[type].length)
  )
}

/**
 * Whether a poll of `uuid` reads `type` of `unit` while it is on screen: the
 * question `_pollableTypes` asks. In Monitor, a polled type the mapping has a
 * group for. In Debug under the unit's read configuration, a type the mapping
 * has a group for; otherwise a polled section whose read asks for registers.
 */
const pollsSection = (
  session: ClientSession,
  unit: ClientUnit,
  type: RegisterType,
  monitor = false
): boolean => {
  const grouped = !readsNothing(true, type, unit.registerMapping, false)
  if (monitor) return unit.sections[type].polled && grouped
  const readConfiguration = session.readConfiguration[unit.uuid] ?? false
  return readConfiguration
    ? grouped
    : unit.sections[type].polled &&
        !readsNothing(
          false,
          type,
          unit.registerMapping,
          isReadLengthGiven(unit.sections[type].length)
        )
}

/** Whether a poll of `uuid` reads `type` of the unit under `unitUuid` while it is on screen. */
export const pollsSectionOf = (
  state: Pick<PersistedClientZustand, 'clients'> & { sessions: Record<string, ClientSession> },
  uuid: string,
  unitUuid: string,
  type: RegisterType
): boolean => {
  const unit = (state.clients[uuid] ?? NO_CLIENT).units.find((unit) => unit.uuid === unitUuid)
  return unit !== undefined && pollsSection(state.sessions[uuid] ?? NO_SESSION, unit, type)
}

/**
 * Whether a poll of `uuid` would read nothing at all, which main refuses.
 * `monitor` asks it of the client Monitor shows.
 */
export const pollsNothingOf = (
  state: Pick<PersistedClientZustand, 'clients'> & { sessions: Record<string, ClientSession> },
  uuid: string,
  monitor = false
): boolean => {
  const client = state.clients[uuid] ?? NO_CLIENT
  const session = state.sessions[uuid] ?? NO_SESSION
  return client.units.every((unit) =>
    RegisterTypeSchema.options.every((type) => !pollsSection(session, unit, type, monitor))
  )
}

/**
 * One client's units read back one at a time, so a unit the schema refuses
 * costs that unit's fields rather than every unit. A unit that is not an
 * object is dropped, and a client left with none gets a default one.
 */
const repairUnits = (units: unknown): { units: ClientUnit[]; reset: boolean } => {
  if (!Array.isArray(units)) return { units: [newClientUnit(v4(), 1)], reset: true }
  let reset = false
  const repaired: ClientUnit[] = []
  for (const unit of units) {
    const uuid =
      typeof unit === 'object' && unit !== null && 'uuid' in unit && typeof unit.uuid === 'string'
        ? unit.uuid
        : v4()
    const repair = repairPersisted(ClientUnitSchema, unit, newClientUnit(uuid, 1))
    if (repair.reset) reset = true
    repaired.push(repair.state)
  }
  if (repaired.length === 0) return { units: [newClientUnit(v4(), 1)], reset: true }
  return { units: repaired, reset }
}

/**
 * The clients read back one at a time, field by field, and a selected uuid
 * that names one of them.
 *
 * `repairPersisted` works a top level field at a time, and `clients` is one
 * field holding every client, so read whole, one register the schema refuses
 * would cost every client's config. The units are read back one at a time for
 * the same reason. A store with no client left gets the default one under
 * `MAIN_CLIENT_UUID`, because the view always shows one. Undefined for a
 * `clients` that is not a record, which the store's own repair then answers
 * with the default.
 */
export const repairClients = (
  state: Selection
): { selection: Selection; fields: string[] } | undefined => {
  const { clients } = state
  if (typeof clients !== 'object' || clients === null || Array.isArray(clients)) return undefined

  const repaired: Record<string, PersistedClient> = {}
  const fields = new Set<string>()
  for (const [uuid, client] of Object.entries(clients)) {
    const units = repairUnits((client as { units?: unknown } | undefined)?.units)
    const repair = repairPersisted(
      PersistedClientSchema,
      { ...(client as object), units: units.units },
      getDefaultClient()
    )
    repaired[uuid] = repair.state
    for (const field of repair.reset?.fields ?? []) fields.add(field)
    if (units.reset) fields.add('units')
  }

  const [first] = Object.keys(repaired)
  if (first === undefined) {
    repaired[MAIN_CLIENT_UUID] = getDefaultClient(MAIN_UNIT_UUID)
    fields.add('clients')
  }
  const selectedUuid = Object.hasOwn(repaired, state.selectedUuid)
    ? state.selectedUuid
    : (first ?? MAIN_CLIENT_UUID)

  return { selection: { selectedUuid, clients: repaired }, fields: [...fields] }
}
