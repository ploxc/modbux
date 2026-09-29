/**
 * The client store's helpers that reach a store when they are called: this
 * one, the live store or the undo store. `client.zustand.helpers.ts` holds the
 * ones that reach none, so the MCP tools, the live store and the tests can load
 * those without a store.
 *
 * These imports close cycles, because the client store imports this module.
 * Every name taken from them is reached from inside a function body, which runs
 * after the modules have evaluated; none is read at this module's scope.
 */
import {
  ClientUnit,
  maxUnitId,
  Protocol,
  clientOwner,
  configuredReadGroups,
  readLoopOwner,
  newClientUnit,
  RegisterConfig,
  RegisterType,
  RegisterTypeSchema,
  SerialPortOptions
} from '@shared'
import { ClientSession, ClientSet, ClientZustand, PersistedClient } from './client.zustand.types'
import {
  getDefaultClient,
  readsNothingOf,
  selectedClient,
  selectedSession,
  selectedUnit,
  shownSection,
  shownType
} from './client.zustand.helpers'
import { useClientZustand } from './client.zustand'
import { dataOf, showMapping, useLiveZustand } from './live.zustand'
import { useUndoZustand } from './undo.zustand'
import { ClientView, clientFieldReaders, clientFieldSteps } from './undo.zustand.helpers'
import { ClientField, ClientFieldValues, ClientStepView } from './undo.zustand.types'

/** Where the view stands now, which a step records and a replay shows again. */
export const viewOf = (state: ClientZustand): ClientStepView => ({
  uuid: state.selectedUuid,
  unit: selectedUnit(state).uuid,
  type: shownType(state)
})

/**
 * The client and the session under `uuid`, as the recipe finds them, or
 * nothing where the uuid holds none.
 *
 * A setter takes the uuid before it awaits main and writes to that uuid after,
 * so an answer that lands after the view moved to another client writes the
 * client it was about. A client taken away meanwhile is written nowhere.
 */
export const onClient = (
  state: ClientZustand,
  uuid: string,
  recipe: (target: { client: PersistedClient; session: ClientSession }) => void
): void => {
  const client = state.clients[uuid]
  const session = state.sessions[uuid]
  if (client && session) recipe({ client, session })
}

/**
 * A mapping edit reaches main 150 ms after the last one, per client, so a
 * run of cell edits is one message. A timer per uuid, because an edit to one
 * client must not hold back or replace another's. What goes is the client's
 * units, whole, as the store holds them then.
 */
const unitTimers = new Map<string, ReturnType<typeof setTimeout>>()
export function syncUnitsToMain(uuid: string): void {
  clearTimeout(unitTimers.get(uuid))
  unitTimers.set(
    uuid,
    setTimeout(() => {
      unitTimers.delete(uuid)
      const client = useClientZustand.getState().clients[uuid]
      if (!client) return
      // Nothing waits on a cell edit reaching main, so the answer has nobody
      // to stop. A refusal reports itself as a `backend_message` and costs
      // main the edit, and the next edit sends the units again.
      void window.api.setUnits({ uuid, units: client.units })
    }, 150)
  )
}

/**
 * Sends `units` now, and answers whether main took them.
 *
 * A send carries every mapping edit the store holds, so one waiting on the
 * timer goes with it and the timer is dropped. It takes the units rather than
 * reading the store, because a caller that writes only once main has them has
 * nothing in the store to send yet.
 */
export const flushUnitsToMain = async (uuid: string, units: ClientUnit[]): Promise<boolean> => {
  clearTimeout(unitTimers.get(uuid))
  unitTimers.delete(uuid)
  return (await window.api.setUnits({ uuid, units })) ?? false
}

/** The unit id after the highest the client holds, within what the protocol takes. */
export const nextUnitId = (units: ClientUnit[], protocol: Protocol): number =>
  Math.min(Math.max(...units.map(({ unitId }) => unitId)) + 1, maxUnitId(protocol))

/**
 * A unit added to the selected client, handed to main with the others and
 * shown. Answers whether main took it.
 */
export const appendUnit = async (
  set: ClientSet,
  get: () => ClientZustand,
  unit: ClientUnit
): Promise<boolean> => {
  const state = get()
  if (!selectedSession(state).ready) return false
  const { selectedUuid } = state
  const { units } = selectedClient(state)
  if (!(await flushUnitsToMain(selectedUuid, [...units, unit]))) return false

  set((draft) =>
    onClient(draft, selectedUuid, ({ client, session }) => {
      client.units.push(unit)
      session.selectedUnit = unit.uuid
    })
  )
  return true
}

/**
 * The selected unit, or the unit of the selected client under `unitUuid`,
 * changed by `change`, sent to main with the client's other units, and written
 * where main took it. Answers the view it changed, or undefined for a store
 * with no session yet, for a unit the client does not hold and for a refusal.
 *
 * The write applies `change` to the unit the store holds then, rather than
 * writing the copy that was sent, so a mapping edit that landed while main
 * answered stays.
 */
export const changeUnit = async (
  set: ClientSet,
  get: () => ClientZustand,
  change: (unit: ClientUnit) => void,
  type: RegisterType = shownType(get()),
  unitUuid: string = selectedUnit(get()).uuid
): Promise<ClientStepView | undefined> => {
  const state = get()
  if (!selectedSession(state).ready) return undefined
  const target = selectedClient(state).units.find(({ uuid }) => uuid === unitUuid)
  if (!target) return undefined
  const view = { ...viewOf(state), unit: unitUuid, type }
  const after = structuredClone(target)
  change(after)
  const units = selectedClient(state).units.map((unit) => (unit.uuid === view.unit ? after : unit))
  if (!(await flushUnitsToMain(view.uuid, units))) return undefined

  set((draft) =>
    onClient(draft, view.uuid, ({ client }) => {
      const unit = client.units.find(({ uuid }) => uuid === view.unit)
      if (unit) change(unit)
    })
  )
  return view
}

/**
 * Answer a question the rows on screen no longer answer.
 *
 * A section's address and length change what a read of it asks for, so the
 * rows of that section are about something else now. The unit id changes
 * which device answers every section of the unit, so all four go. A poll puts
 * new ones there on its own.
 *
 * With read configuration on, emptying the grid is the wrong answer for the
 * unit id, because the grid is drawn from the mapping there and the configured
 * rows would go with it: the rows are redrawn and main is asked to fill the one
 * on screen. The address and the length change nothing there. `_readSection`
 * builds its groups from the mapping and falls back to the window only when the
 * mapping has none, so the rows still answer the same question. Both fields
 * are disabled while read configuration is on, so this is the rule rather than
 * a state to reach.
 *
 * `configuredReadGroups` is that same fallback asked before the ask. A type
 * with no group under it configures nothing main will read, so a read there
 * comes back as the window over the mapping just drawn. The redraw still
 * happens, because the mapping is what the grid is about; the ask does not.
 */
export const clearRegisterDataWhenIdle = (
  { uuid, unit, type }: ClientStepView,
  wholeUnit: boolean
): void => {
  const { clients, sessions } = useClientZustand.getState()
  const found = clients[uuid]?.units.find((candidate) => candidate.uuid === unit)
  if (!found) return
  if (dataOf(useLiveZustand.getState(), uuid).clientState.polling) return
  const types = wholeUnit ? RegisterTypeSchema.options : [type]
  if (sessions[uuid]?.readConfiguration[unit]) {
    if (!wholeUnit) return
    for (const each of types) showMapping(uuid, unit, each)
    if (configuredReadGroups(true, type, found.registerMapping).length > 0) {
      readWhenMainCan({ uuid, unit, type })
    }
    return
  }
  for (const each of types) useLiveZustand.getState().setRegisterData(uuid, unit, each, [])
}

/**
 * Whether a connection field may change, which is while no connection stands.
 *
 * Five setters ask it: `setSerialOption` for the four serial options, and
 * `setProtocol`, `setPort`, `setHost` and `setCom`. `connectState` lives in
 * `live.zustand` with the rest of what main pushes, so they read it there
 * rather than out of the state they are writing.
 */
export const isDisconnected = (uuid: string): boolean =>
  dataOf(useLiveZustand.getState(), uuid).clientState.connectState === 'disconnected'

/**
 * The last call of each setter that writes an invalid value at once, per
 * client, so the answer to an earlier valid call can tell it came too late.
 */
const latestCall = new Map<string, number>()

/**
 * Starts a call of `field` on `uuid`, and answers whether it is still the
 * latest one.
 *
 * `setHost` and `setCom` write an invalid value at once and a
 * valid one after main answers, so a valid key's answer can arrive after a
 * later invalid key was written. Written then, it would put the older value
 * back in the store while the field shows the newer.
 */
export const startCall = (uuid: string, field: 'host' | 'com'): (() => boolean) => {
  const key = `${uuid}:${field}`
  const call = (latestCall.get(key) ?? 0) + 1
  latestCall.set(key, call)
  return () => latestCall.get(key) === call
}

/**
 * Records the value a field had, when a write left the store holding another.
 *
 * Called after the `set`, including where an invalid value is kept and never
 * sent: clearing the host and typing a new one is one run, and the run starts
 * from the host there was before the field was cleared.
 *
 * A client taken away while main answered records nothing: `deleteClient`
 * has cleared its steps already, and one pushed after would refuse every undo
 * below it.
 */
export const recordField = <Field extends ClientField>(
  view: ClientStepView,
  field: Field,
  before: ClientFieldValues[Field],
  after: ClientFieldValues[Field]
): void => {
  if (before === after) return
  if (!useClientZustand.getState().clients[view.uuid]) return
  useUndoZustand.getState().recordClient(clientFieldSteps[field](before, view))
}

/** What the view shows now, as `clientFieldReaders` reads it. */
const viewedOf = (state: ClientZustand): ClientView => ({
  client: selectedClient(state),
  unit: selectedUnit(state),
  section: shownSection(state)
})

/**
 * One serial option, sent and then written where main took it.
 *
 * `baudRate`, `parity`, `dataBits` and `stopBits` differ in nothing but the
 * key. All four describe the line a connect opens, so all four are refused
 * while one stands. `setCom` is not this shape: it carries a validity flag.
 */
export const setSerialOption = async <Key extends keyof SerialPortOptions>(
  set: ClientSet,
  get: () => ClientZustand,
  key: Key,
  value: SerialPortOptions[Key]
): Promise<boolean> => {
  const uuid = get().selectedUuid
  if (!selectedSession(get()).ready) return false
  if (!isDisconnected(uuid)) return false

  const view = viewOf(get())
  const before = clientFieldReaders[key](viewedOf(get()))
  if (
    !(await window.api.updateConnectionConfig({
      uuid,
      connectionConfig: { rtu: { options: { [key]: value } } }
    }))
  )
    return false

  set((state) =>
    onClient(state, uuid, ({ client }) => {
      client.connectionConfig.rtu.options[key] = value
    })
  )
  if (get().clients[uuid])
    recordField<keyof SerialPortOptions>(
      view,
      key,
      before,
      clientFieldReaders[key](viewedOf(get()))
    )
  return true
}

/**
 * One register config field, sent and then written where main took it.
 *
 * Every field of `RegisterConfig` differs in nothing but the key.
 */
export const setRegisterConfigField = async <Key extends keyof RegisterConfig>(
  set: ClientSet,
  get: () => ClientZustand,
  key: Key,
  value: RegisterConfig[Key]
): Promise<boolean> => {
  const uuid = get().selectedUuid
  if (!selectedSession(get()).ready) return false
  const view = viewOf(get())
  const before = selectedClient(get()).registerConfig[key]
  if (!(await window.api.updateRegisterConfig({ uuid, registerConfig: { [key]: value } })))
    return false

  set((state) =>
    onClient(state, uuid, ({ client }) => {
      client.registerConfig[key] = value
    })
  )
  recordField<keyof RegisterConfig>(view, key, before, value)
  return true
}

/**
 * Ask main for a read, unless it is in no position to answer.
 *
 * `read` refuses and says so in a snackbar when anything owns the client, and
 * again when nothing is connected, so a caller that asks anyway costs the user
 * a warning it did not ask for, and it refuses a read of no registers the
 * same way. `clientOwner` is the question main asks. `readsNothingOf` asks
 * main's length question of what the Length field shows, which is what main
 * holds after a restart and what the field leaves unsent before one.
 */
export const readWhenMainCan = (target: ClientStepView): void => {
  const { clientState } = dataOf(useLiveZustand.getState(), target.uuid)
  if (clientState.connectState !== 'connected') return
  if (clientOwner(clientState)) {
    // A read or a write answers for the addressing it went out with, and main
    // drops that answer once the addressing moved, so the ask waits for it to
    // settle. A poll or a scan reads again by itself.
    if (!readLoopOwner(clientState)) waitToRead(target)
    return
  }
  if (readsNothingOf(useClientZustand.getState(), target.uuid)) return
  window.api.read(target)
}

/** The asks for a read that wait for the request they had in flight, one per client. */
const readsWaiting = new Map<string, ClientStepView>()
let listening = false

/**
 * Keeps the ask until the client is free, and asks again then.
 *
 * Subscribed here rather than at module scope, because this module and
 * `live.zustand` import each other: entered through that one, this body runs
 * before `useLiveZustand` exists. A poll or a scan that took over drops the
 * ask, because it reads by itself, and so does a connection that went.
 */
const waitToRead = (target: ClientStepView): void => {
  readsWaiting.set(target.uuid, target)
  if (listening) return
  listening = true
  const stop = useLiveZustand.subscribe((state) => {
    for (const [uuid, waiting] of readsWaiting) {
      const { clientState } = dataOf(state, uuid)
      if (clientOwner(clientState) && !readLoopOwner(clientState)) continue
      // `readWhenMainCan` asks the connection and the owner again, and asks
      // nothing of a poll or a scan.
      readsWaiting.delete(uuid)
      readWhenMainCan(waiting)
    }
    if (readsWaiting.size > 0) return
    stop()
    listening = false
  })
}

/**
 * How many runs hold the selection where it is: an undo, a redo, a Load or a
 * Clear Config of the client view. Each goes through setters that act on the
 * client the view shows, across awaits, and a selection that moved between
 * two of them would send the rest to another client.
 */
let selectionHolds = 0
export const selectionHeld = (): boolean => selectionHolds > 0

/** Runs `run` with the selection held, however it ends. */
export const holdSelection = async <Result>(run: () => Promise<Result>): Promise<Result> => {
  selectionHolds++
  try {
    return await run()
  } finally {
    selectionHolds--
  }
}

/**
 * Make a client in main with this store's config for it, in one call.
 *
 * A window that comes back finds main holding its clients already, maybe
 * connected, and a connected one keeps the connection main opened. Main
 * handles invokes in the order they arrive and makes the client without
 * waiting on anything, so the call after it finds it there.
 */
export const handToMain = (
  uuid: string,
  { connectionConfig, registerConfig, units }: PersistedClient
): void => {
  window.api.createClient({ uuid, connectionConfig, registerConfig, units })
  for (const unit of units) {
    window.api.setReadConfiguration({ uuid, unit: unit.uuid, readConfiguration: false })
  }
}

export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A stored client with the defaults of what it does not carry, a field of the
 * register config included: a store written before `offlineAfterTimeouts` and
 * `maxPollInterval` existed holds a register config without them, and the
 * schema would reset the whole of it for two fields nobody set.
 */
export const withDefaults = (client: Record<string, unknown>): Record<string, unknown> => {
  const defaults = getDefaultClient()
  const { registerConfig, units } = client
  return {
    ...defaults,
    ...client,
    // A unit is filled the same way: a field a store did not carry gets its
    // default rather than costing the unit a reset.
    units: Array.isArray(units)
      ? units.map((unit) =>
          isPlainRecord(unit) && typeof unit.uuid === 'string'
            ? { ...newClientUnit(unit.uuid, 1), ...unit }
            : unit
        )
      : (units ?? defaults.units),
    registerConfig: isPlainRecord(registerConfig)
      ? { ...defaults.registerConfig, ...registerConfig }
      : registerConfig === undefined
        ? defaults.registerConfig
        : registerConfig
  }
}
