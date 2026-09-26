/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import { v4 } from 'uuid'
import {
  ClientSession,
  ClientSet,
  PersistedClient,
  PersistedClientZustand,
  PersistedClientZustandSchema,
  ClientZustand
} from './client.zustand.types'
import {
  CURRENT_CLIENT_ZUSTAND_VERSION,
  migrateClientState,
  foldClientIntoRecord,
  carryFormerClientState,
  CLIENT_ZUSTAND_STORAGE_KEY,
  clientOwner,
  readLoopOwner,
  ClientUnit,
  configuredReadGroups,
  maxUnitId,
  newClientUnit,
  emptyRegisterMapping,
  MAIN_CLIENT_UUID,
  RegisterConfig,
  RegisterType,
  RegisterTypeSchema,
  SerialPortOptions
} from '@shared'
import {
  getDefaultClient,
  MAIN_UNIT_UUID,
  pollsNothingOf,
  readsConfiguration,
  readsNothingIn,
  readsNothingOf,
  readySession,
  repairClients,
  selectedClient,
  selectedSession,
  selectedUnit,
  shownSection,
  shownType,
  unitOf
} from './client.zustand.helpers'
import { dataOf, sectionOf, showMapping, useLiveZustand } from './live.zustand'
import { loadSerialPorts } from './serialPorts'
import { repairPersistedStore } from './repairPersistedStore'
import { useUndoZustand } from './undo.zustand'
import { clientFieldReaders, clientFieldSteps } from './undo.zustand.helpers'
import { ClientField, ClientFieldValues, ClientStepView } from './undo.zustand.types'

/**
 * The uuid of the client the view shows, which every client channel a view
 * calls names.
 */
export const selectedClientUuid = (): string => useClientZustand.getState().selectedUuid

/** The client the view shows, read now rather than subscribed to. */
export const getSelectedClient = (): PersistedClient => selectedClient(useClientZustand.getState())

/** Its session, read now rather than subscribed to. */
export const getSelectedSession = (): ClientSession => selectedSession(useClientZustand.getState())

/** The unit the view shows, read now rather than subscribed to. */
export const getSelectedUnit = (): ClientUnit => selectedUnit(useClientZustand.getState())

/** The register type the view shows, read now rather than subscribed to. */
export const getShownType = (): RegisterType => shownType(useClientZustand.getState())

/** The unit the view shows in `state`, or undefined where no client is selected. */
export const selectedUnitOf = (state: ClientZustand): ClientUnit | undefined => {
  const client = state.clients[state.selectedUuid]
  const session = state.sessions[state.selectedUuid]
  return client && session ? unitOf(client, session) : undefined
}

/** Where the view stands now, which a step records and a replay shows again. */
const viewOf = (state: ClientZustand): ClientStepView => ({
  uuid: state.selectedUuid,
  unit: selectedUnit(state).uuid,
  type: shownType(state)
})

export {
  readsNothingIn,
  MAIN_UNIT_UUID,
  pollsNothingOf,
  readsConfiguration,
  readsNothingOf,
  selectedClient,
  selectedSession,
  selectedUnit,
  shownSection,
  shownType
}

/**
 * The client and the session under `uuid`, as the recipe finds them, or
 * nothing where the uuid holds none.
 *
 * A setter takes the uuid before it awaits main and writes to that uuid after,
 * so an answer that lands after the view moved to another client writes the
 * client it was about. A client taken away meanwhile is written nowhere.
 */
const onClient = (
  state: ClientZustand,
  uuid: string,
  recipe: (target: { client: PersistedClient; session: ClientSession }) => void
): void => {
  const client = state.clients[uuid]
  const session = state.sessions[uuid]
  if (client && session) recipe({ client, session })
}

/** The order the type buttons show, which a second type opens in. */
const SIDE_BY_SIDE_ORDER: RegisterType[] = [
  'holding_registers',
  'input_registers',
  'coils',
  'discrete_inputs'
]

/**
 * The version the blob on disk carried, set by `migrate` and read once below.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered.
 */
let persistedVersion: number | undefined

/**
 * A mapping edit reaches main 150 ms after the last one, per client, so a
 * run of cell edits is one message. A timer per uuid, because an edit to one
 * client must not hold back or replace another's. What goes is the client's
 * units, whole, as the store holds them then.
 */
const unitTimers = new Map<string, ReturnType<typeof setTimeout>>()
function syncUnitsToMain(uuid: string): void {
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

/**
 * The selected unit changed by `change`, sent to main with the client's other
 * units, and written where main took it. Answers the view it changed, or
 * undefined for a store with no session yet and for a refusal.
 *
 * The write applies `change` to the unit the store holds then, rather than
 * writing the copy that was sent, so a mapping edit that landed while main
 * answered stays.
 */
const changeUnit = async (
  set: ClientSet,
  get: () => ClientZustand,
  change: (unit: ClientUnit) => void,
  type: RegisterType = shownType(get())
): Promise<ClientStepView | undefined> => {
  const state = get()
  if (!selectedSession(state).ready) return undefined
  const view = { ...viewOf(state), type }
  const after = structuredClone(selectedUnit(state))
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
 * `configuredReadGroups` is that same fallback asked before the ask. A bit
 * type configures nothing main will read, and neither does a type with no
 * group under it, so a read there comes back as the window over the mapping
 * just drawn. The redraw still happens, because the mapping is what the grid
 * is about; the ask does not.
 */
const clearRegisterDataWhenIdle = (
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
const isDisconnected = (uuid: string): boolean =>
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
const startCall = (uuid: string, field: 'host' | 'com'): (() => boolean) => {
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
const recordField = <Field extends ClientField>(
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
const viewedOf = (state: ClientZustand) => ({
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
const setSerialOption = async <Key extends keyof SerialPortOptions>(
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
const setRegisterConfigField = async <Key extends keyof RegisterConfig>(
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
const readWhenMainCan = (target: ClientStepView): void => {
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
const selectionHeld = (): boolean => selectionHolds > 0

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
const handToMain = (
  uuid: string,
  { connectionConfig, registerConfig, units }: PersistedClient
): void => {
  window.api.createClient({ uuid, connectionConfig, registerConfig, units })
  for (const unit of units) {
    window.api.setReadConfiguration({ uuid, unit: unit.uuid, readConfiguration: false })
  }
}

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A stored client with the defaults of what it does not carry, a field of the
 * register config included: a store written before `offlineAfterTimeouts` and
 * `maxPollInterval` existed holds a register config without them, and the
 * schema would reset the whole of it for two fields nobody set.
 */
const withDefaults = (client: Record<string, unknown>): Record<string, unknown> => {
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

carryFormerClientState(localStorage)

export const useClientZustand = create<
  ClientZustand,
  [['zustand/persist', PersistedClientZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      // Clients
      selectedUuid: MAIN_CLIENT_UUID,
      clients: { [MAIN_CLIENT_UUID]: getDefaultClient(MAIN_UNIT_UUID) },
      sessions: {},
      setSelectedUuid: (uuid) => {
        if (selectionHeld()) return
        set((state) => {
          if (Object.hasOwn(state.clients, uuid)) state.selectedUuid = uuid
        })
      },
      addClient: () => {
        const uuid = v4()
        const client = getDefaultClient()
        handToMain(uuid, client)
        const held = selectionHeld()
        set((state) => {
          state.clients[uuid] = client
          state.sessions[uuid] = readySession(client)
          if (!held) state.selectedUuid = uuid
        })
        return uuid
      },
      deleteClient: async (uuid) => {
        const { clients } = get()
        if (selectionHeld()) return false
        if (!Object.hasOwn(clients, uuid) || Object.keys(clients).length < 2) return false

        // Everything here goes before main is asked, so nothing that runs
        // while main answers finds the client: a mapping edit waiting to be
        // sent would reach main after the delete, and an undo of one of its
        // steps would put that step back on the stack.
        set((state) => {
          delete state.clients[uuid]
          delete state.sessions[uuid]
          if (state.selectedUuid !== uuid) return
          const [first = MAIN_CLIENT_UUID] = Object.keys(state.clients)
          state.selectedUuid = first
        })
        useLiveZustand.getState().dropClient(uuid)
        // A step whose client is gone has nothing to be put back into, and
        // left on the stack it would refuse every undo after it.
        const undo = useUndoZustand.getState()
        const { past, future, openKey } = undo.client
        undo.setClient({
          past: past.filter((step) => step.uuid !== uuid),
          future: future.filter((step) => step.uuid !== uuid),
          openKey
        })

        await window.api.deleteClient(uuid)
        return true
      },

      // Config
      init: () => {
        const { clients } = get()
        for (const [uuid, client] of Object.entries(clients)) handToMain(uuid, client)

        set((state) => {
          for (const [uuid, client] of Object.entries(state.clients)) {
            state.sessions[uuid] = readySession(client)
          }
        })
      },
      setName: (name) => {
        const view = viewOf(get())
        const before = selectedClient(get()).name
        set((state) =>
          onClient(state, view.uuid, ({ client }) => {
            client.name = name
          })
        )
        recordField(view, 'name', before, name)
      },
      configReset: undefined,
      acknowledgeConfigReset: () =>
        set((state) => {
          state.configReset = undefined
        }),
      setRegisterMapping: (register, key, value) => {
        const view = viewOf(get())
        const { type } = view
        const before = selectedUnit(get()).registerMapping[type][register]

        set((state) =>
          onClient(state, view.uuid, ({ client }) => {
            const unit = client.units.find(({ uuid }) => uuid === view.unit)
            if (!unit) return
            const mapping = unit.registerMapping[type]
            // Remove register from mapping when data type is set to 'none'
            if (key === 'dataType' && value === 'none') {
              delete mapping[register]
              return
            }

            const entry = mapping[register]
            if (!entry) {
              mapping[register] = { [key]: value }
              return
            }

            entry[key] = value
          })
        )

        if (selectedUnit(get()).registerMapping[type][register] !== before) {
          useUndoZustand
            .getState()
            .recordClient({ ...view, kind: 'mapping', register, column: key, value: before })
        }
        syncUnitsToMain(view.uuid)
      },
      setMappingEntry: (type, register, entry) => {
        const view = viewOf(get())
        set((state) =>
          onClient(state, view.uuid, ({ client }) => {
            const unit = client.units.find(({ uuid }) => uuid === view.unit)
            if (!unit) return
            if (entry === undefined) delete unit.registerMapping[type][register]
            else unit.registerMapping[type][register] = entry
          })
        )
        syncUnitsToMain(view.uuid)
      },
      replaceRegisterMapping: async (registerMapping) => {
        // Read configuration is the one thing that makes main read the mapping,
        // so turning it off first leaves no read answering out of the mapping
        // this call throws away.
        get().setReadConfiguration(false)

        // Main keeps the units it had when it refuses them, so a write here
        // would leave the grid showing registers main is not holding. What a
        // refusal costs is read configuration, which is off by the line above
        // and stays off: both sides hold the mapping from before, and the
        // message main sends names the channel.
        const view = await changeUnit(set, get, (unit) => {
          unit.registerMapping = registerMapping
        })
        return view !== undefined
      },
      clearRegisterMapping: () => get().replaceRegisterMapping(emptyRegisterMapping()),

      //
      //
      // Protocol
      //
      // Every setter below sends first and writes only what main took, so a
      // payload the schemas refuse leaves both sides on the value they had.
      // `1,5` in a mask field is `NaN`, `UnitIdSchema` refuses it, and a store
      // that wrote it persisted `null` and lost the whole config on the next
      // launch. A round trip is shorter than the gap between two keystrokes, so
      // no field waits on the answer. The exception is a field carrying a
      // validity flag, which sends nothing while that flag is false; the host,
      // the COM port and the length each say why where they stand.
      //
      // Nine of them differ in nothing but a key under `rtu.options` or under
      // `registerConfig`, and those are one line each over `setSerialOption`
      // or `setRegisterConfigField` above. Every setter still written out
      // below has its own reason: a payload of another shape, a string to
      // convert, a validity flag, a grid to clear, a read to ask for.
      setProtocol: async (protocol) => {
        const uuid = get().selectedUuid
        const view = viewOf(get())
        if (!selectedSession(get()).ready) return false
        if (!isDisconnected(uuid)) return false

        const before = selectedClient(get()).connectionConfig.protocol
        if (!(await window.api.updateConnectionConfig({ uuid, connectionConfig: { protocol } })))
          return false

        set((state) =>
          onClient(state, uuid, ({ client }) => {
            client.connectionConfig.protocol = protocol
          })
        )
        recordField(view, 'protocol', before, protocol)
        return true
      },
      //
      //
      // TCP
      setPort: async (port) => {
        const uuid = get().selectedUuid
        const view = viewOf(get())
        if (!selectedSession(get()).ready) return false
        if (!isDisconnected(uuid)) return false

        const newPort = Number(port)
        const before = selectedClient(get()).connectionConfig.tcp.options.port
        if (
          !(await window.api.updateConnectionConfig({
            uuid,
            connectionConfig: { tcp: { options: { port: newPort } } }
          }))
        )
          return false

        set((state) =>
          onClient(state, uuid, ({ client }) => {
            client.connectionConfig.tcp.options.port = newPort
          })
        )
        recordField(view, 'port', before, newPort)
        return true
      },
      setHost: async (host, valid) => {
        const uuid = get().selectedUuid
        const view = viewOf(get())
        if (!selectedSession(get()).ready) return false
        if (!isDisconnected(uuid)) return false

        const before = selectedClient(get()).connectionConfig.tcp.host
        const isLatest = startCall(uuid, 'host')

        // The field reads its text from the store, so an invalid host is kept
        // here and never sent. What the boundary never sees needs no answer.
        if (!valid) {
          set((state) =>
            onClient(state, uuid, ({ client, session }) => {
              session.valid.host = false
              client.connectionConfig.tcp.host = host
            })
          )
          recordField(view, 'host', before, host)
          return false
        }

        if (
          !(await window.api.updateConnectionConfig({ uuid, connectionConfig: { tcp: { host } } }))
        )
          return false
        if (!isLatest()) return false

        set((state) =>
          onClient(state, uuid, ({ client, session }) => {
            session.valid.host = true
            client.connectionConfig.tcp.host = host
          })
        )
        recordField(view, 'host', before, host)
        return true
      },
      //
      //
      // RTU
      setCom: async (com, valid) => {
        const uuid = get().selectedUuid
        const view = viewOf(get())
        if (!selectedSession(get()).ready) return false
        if (!isDisconnected(uuid)) return false

        // The field reads its text from the store, so a blank port name is
        // kept here and never sent. `ConnectionConfigRtuSchema` types `com` as
        // a string and takes a blank one, so the boundary had nothing to refuse
        // and main held a connection config naming no port.
        const before = selectedClient(get()).connectionConfig.rtu.com
        const isLatest = startCall(uuid, 'com')
        if (!valid) {
          set((state) =>
            onClient(state, uuid, ({ client, session }) => {
              session.valid.com = false
              client.connectionConfig.rtu.com = com
            })
          )
          recordField(view, 'com', before, com)
          return false
        }

        if (
          !(await window.api.updateConnectionConfig({ uuid, connectionConfig: { rtu: { com } } }))
        )
          return false
        if (!isLatest()) return false

        set((state) =>
          onClient(state, uuid, ({ client, session }) => {
            session.valid.com = true
            client.connectionConfig.rtu.com = com
          })
        )
        recordField(view, 'com', before, com)
        return true
      },
      setBaudRate: (baudRate) => setSerialOption(set, get, 'baudRate', baudRate),
      setParity: (parity) => setSerialOption(set, get, 'parity', parity),
      setDataBits: (dataBits) => setSerialOption(set, get, 'dataBits', dataBits),
      setStopBits: (stopBits) => setSerialOption(set, get, 'stopBits', stopBits),
      //
      //
      // Layout configuration settings
      setShow64BitValues: (show64BitValues) =>
        setRegisterConfigField(set, get, 'show64BitValues', show64BitValues),
      setAdvancedMode: (advancedMode) =>
        setRegisterConfigField(set, get, 'advancedMode', advancedMode),
      // Addressing, on the unit the view shows
      setUnitId: async (unitId) => {
        // `UnitIdInput` is an `IMaskInput`, which fires `accept` when the value
        // it is handed differs from the empty mask it mounts with, so every
        // mount of the toolbar field and of the scan dialog's calls this with
        // the id the store already holds. The rows below would go with it.
        // A cleared field is no id. `Number('')` is 0, the broadcast address on
        // RTU, so it is refused here and the store keeps the id it had.
        if (unitId === '') return false
        const newUnitId = Number(unitId)
        const before = selectedUnit(get()).unitId
        if (newUnitId === before) return true

        const view = await changeUnit(set, get, (unit) => {
          unit.unitId = newUnitId
        })
        if (!view) return false
        recordField(view, 'unitId', before, newUnitId)
        clearRegisterDataWhenIdle(view, true)
        return true
      },
      setAddress: async (address, _valid, type = shownType(get())) => {
        const newAddress = Number(address)
        const before = selectedUnit(get()).sections[type].address
        if (newAddress === before) return true

        const view = await changeUnit(
          set,
          get,
          (unit) => {
            unit.sections[type].address = newAddress
          },
          type
        )
        if (!view) return false
        recordField(view, 'address', before, newAddress)
        clearRegisterDataWhenIdle(view, false)
        return true
      },
      // A cleared field is a length of 0, which the schema takes and main
      // refuses to read, so it is sent like any other.
      setLength: async (length, _valid, type = shownType(get())) => {
        const newLength = Number(length)
        const before = selectedUnit(get()).sections[type].length
        if (newLength === before) return true

        const view = await changeUnit(
          set,
          get,
          (unit) => {
            unit.sections[type].length = newLength
          },
          type
        )
        if (!view) return false
        recordField(view, 'length', before, newLength)
        clearRegisterDataWhenIdle(view, false)
        return true
      },
      setPolled: async (type, polled) => {
        const before = selectedUnit(get()).sections[type].polled
        if (polled === before) return true
        const view = await changeUnit(
          set,
          get,
          (unit) => {
            unit.sections[type].polled = polled
          },
          type
        )
        if (!view) return false
        recordField(view, 'polled', before, polled)
        return true
      },
      addUnit: async () => {
        const state = get()
        if (!selectedSession(state).ready) return false
        const { selectedUuid } = state
        const { units, connectionConfig } = selectedClient(state)
        // The id after the highest one held, within what the protocol takes.
        const highest = Math.max(...units.map(({ unitId }) => unitId))
        const unitId = Math.min(highest + 1, maxUnitId(connectionConfig.protocol))
        const unit = newClientUnit(v4(), unitId)
        if (!(await flushUnitsToMain(selectedUuid, [...units, unit]))) return false

        set((draft) =>
          onClient(draft, selectedUuid, ({ client, session }) => {
            client.units.push(unit)
            session.selectedUnit = unit.uuid
          })
        )
        return true
      },
      removeUnit: async (unit) => {
        const state = get()
        if (!selectedSession(state).ready) return false
        const { selectedUuid } = state
        const { units } = selectedClient(state)
        // The view always shows a unit, so the last one stays.
        const kept = units.filter(({ uuid }) => uuid !== unit)
        if (kept.length === units.length || kept.length === 0) return false
        if (!(await flushUnitsToMain(selectedUuid, kept))) return false

        set((draft) =>
          onClient(draft, selectedUuid, ({ client, session }) => {
            client.units = client.units.filter(({ uuid }) => uuid !== unit)
            delete session.readConfiguration[unit]
            if (session.selectedUnit === unit) session.selectedUnit = client.units[0]?.uuid ?? ''
          })
        )
        // A step whose unit is gone has nothing to be put back into, and left
        // on the stack it would refuse every undo after it.
        const undo = useUndoZustand.getState()
        const { past, future, openKey } = undo.client
        const onOther = (step: { uuid: string; unit: string }): boolean =>
          step.uuid !== selectedUuid || step.unit !== unit
        undo.setClient({ past: past.filter(onOther), future: future.filter(onOther), openKey })
        return true
      },
      setUnitName: (name) => {
        const view = viewOf(get())
        set((state) =>
          onClient(state, view.uuid, ({ client }) => {
            const unit = client.units.find(({ uuid }) => uuid === view.unit)
            if (unit) unit.name = name
          })
        )
        // A name changes nothing a read asks, so it goes with the next send.
        syncUnitsToMain(view.uuid)
      },
      selectUnit: (unit) => {
        const { selectedUuid } = get()
        set((state) =>
          onClient(state, selectedUuid, ({ client, session }) => {
            if (client.units.some(({ uuid }) => uuid === unit)) session.selectedUnit = unit
          })
        )
      },
      setType: (type) => {
        const { selectedUuid } = get()
        set((state) =>
          onClient(state, selectedUuid, ({ session }) => {
            const used = session.shownType
            session.shownType = type
            if (session.openTypes.includes(type)) return
            session.openTypes = session.openTypes.length < 2 ? [type] : [used, type]
          })
        )
      },
      focusType: (type) => {
        const { selectedUuid } = get()
        set((state) =>
          onClient(state, selectedUuid, ({ session }) => {
            if (session.openTypes.includes(type)) session.shownType = type
          })
        )
      },
      setSideBySide: (sideBySide) => {
        const { selectedUuid } = get()
        set((state) =>
          onClient(state, selectedUuid, ({ session }) => {
            if (!sideBySide) {
              session.openTypes = [session.shownType]
              return
            }
            if (session.openTypes.length > 1) return
            // The first type in the order the buttons show that is not open yet.
            const [next] = SIDE_BY_SIDE_ORDER.filter((type) => type !== session.shownType)
            if (next) session.openTypes = [session.shownType, next]
          })
        )
      },
      closeType: (type) => {
        const { selectedUuid } = get()
        set((state) =>
          onClient(state, selectedUuid, ({ session }) => {
            if (session.openTypes.length < 2) return
            session.openTypes = session.openTypes.filter((open) => open !== type)
            const [left = session.shownType] = session.openTypes
            if (session.shownType === type) session.shownType = left
          })
        )
      },
      setLittleEndian: async (littleEndian) => {
        const before = selectedUnit(get()).littleEndian
        if (littleEndian === before) return true
        const view = await changeUnit(set, get, (unit) => {
          unit.littleEndian = littleEndian
        })
        if (!view) return false
        recordField(view, 'littleEndian', before, littleEndian)

        // The rows on screen were read in the other word order, and the
        // conversion happens where the reading does, so they stay that way
        // until the next read. An empty grid has nothing to put right.
        const { registerData } = sectionOf(
          useLiveZustand.getState(),
          view.uuid,
          view.unit,
          view.type
        )
        if (registerData.length > 0) readWhenMainCan(view)
        return true
      },
      setAddressBase: async (addressBase) => {
        const before = selectedUnit(get()).addressBase
        if (addressBase === before) return true
        const view = await changeUnit(set, get, (unit) => {
          unit.addressBase = addressBase
        })
        if (!view) return false
        recordField(view, 'addressBase', before, addressBase)
        return true
      },
      setReadConfiguration: (readConfiguration) => {
        const { uuid, unit } = viewOf(get())
        if (!selectedSession(get()).ready) return
        set((state) =>
          onClient(state, uuid, ({ session }) => {
            session.readConfiguration[unit] = readConfiguration
          })
        )
        // No read follows. One fired by the switch could land after the switch
        // went back, and a read of the window then filled a grid drawing the
        // mapping. The next Read or poll brings the values.
        window.api.setReadConfiguration({ uuid, unit, readConfiguration })
      },
      // Reading
      setPollRate: (pollRate) => setRegisterConfigField(set, get, 'pollRate', pollRate),
      setTimeout: (timeout) => setRegisterConfigField(set, get, 'timeout', timeout),
      setOfflineAfterTimeouts: (offlineAfterTimeouts) =>
        setRegisterConfigField(set, get, 'offlineAfterTimeouts', offlineAfterTimeouts),
      setMaxPollInterval: (maxPollInterval) =>
        setRegisterConfigField(set, get, 'maxPollInterval', maxPollInterval),

      // Serial port discovery
      serialPorts: [],
      serialPortsLoading: false,
      serialPortValidating: false,
      refreshSerialPorts: () => loadSerialPorts(set),
      validateSerialPort: async (portPath) => {
        set((state) => {
          state.serialPortValidating = true
        })
        try {
          return await window.api.validateSerialPort(portPath)
        } finally {
          set((state) => {
            state.serialPortValidating = false
          })
        }
      }
    })),
    {
      name: CLIENT_ZUSTAND_STORAGE_KEY,
      version: CURRENT_CLIENT_ZUSTAND_VERSION,
      migrate: (state, version) => {
        persistedVersion = version
        return migrateClientState(state, version) as PersistedClientZustand
      },
      // `migrate` folds a store from before clients were keyed by uuid for
      // every version but the current one, and this does it for the current
      // one, which was written both ways.
      //
      // A field a client does not carry gets its default here, the way
      // persist's shallow merge gave a field the flat store did not carry
      // its default. What `repairClients` reports is a field that is there
      // and does not parse.
      merge: (persisted, current) => {
        if (typeof persisted !== 'object' || persisted === null) return current
        const state = { ...(persisted as Record<string, unknown>) }
        foldClientIntoRecord(state)
        const { clients } = state
        if (typeof clients === 'object' && clients !== null && !Array.isArray(clients)) {
          state.clients = Object.fromEntries(
            Object.entries(clients).map(([uuid, client]) => [
              uuid,
              // An array spreads into a default client that parses, and the
              // config in it would go without a reset reported.
              isPlainRecord(client) ? withDefaults(client) : client
            ])
          )
        }
        return { ...current, ...state }
      },
      partialize: (state) => ({
        selectedUuid: state.selectedUuid,
        clients: state.clients
      })
    }
  )
)

const clientZustand = useClientZustand.getState()

/**
 * The window this module may call main from, the question its siblings ask.
 * `layout.zustand`, `server.zustand` and `live.zustand` each read it too, and
 * `live.zustand`'s tail is the other one that calls main from module scope.
 *
 * `App.tsx` imports `containers/Client` statically and `Client.tsx:11` imports
 * this file, so `out/renderer/assets/` holds one js file and both windows
 * evaluate this module scope. Without the guard, opening the split out server
 * window ran `init`, which hands main the config this window loaded and calls
 * `setReadConfiguration(false)`. `ModbusClient._read` reads that flag, and off
 * it polls one flat `[address, length]` block instead of the configured groups,
 * while the main window's toggle still reads on. `init`'s own `set` writes
 * `CLIENT_ZUSTAND_STORAGE_KEY` as well, because persist wraps `setState`, so
 * the split window overwrote the shared key on every open.
 *
 * Every call this tail makes to main is inside the guard now. The app version
 * was the one outside it, and `layout.zustand` fetches it instead, beside the
 * field it fills and in both windows. What is left unguarded asks main nothing:
 * the repair below. Its `setState` still writes the shared key, for the same
 * reason `init`'s does.
 */
const isServerWindow = window.api.isServerWindow

// Keep the fields that parsed and default the rest, then say which went. Each
// client is read back on its own first, the way `repairServers` reads a
// server, and handed over rather than written through the store, because a
// `setState` here persists and the copy `keepCorrupt` takes is of the key.
const loadedState = useClientZustand.getState()
const repairedClients = repairClients(loadedState)
const repair = repairPersistedStore(useClientZustand, PersistedClientZustandSchema, {
  storageKey: CLIENT_ZUSTAND_STORAGE_KEY,
  persistedVersion,
  currentVersion: CURRENT_CLIENT_ZUSTAND_VERSION,
  state: repairedClients && { ...loadedState, ...repairedClients.selection },
  alsoReset: repairedClients?.fields
})

if (repair) useClientZustand.setState({ ...repair.state, configReset: repair.reset })

// A selected uuid that names no client costs no field, so the repair above can
// leave it, and so can a `clients` it reset whole. The view would show no
// client and every setter would write nowhere.
const { selectedUuid: repairedSelection, clients: repairedRecord } = useClientZustand.getState()
if (!Object.hasOwn(repairedRecord, repairedSelection)) {
  const [first = MAIN_CLIENT_UUID] = Object.keys(repairedRecord)
  useClientZustand.setState({ selectedUuid: first })
}

// Sync the main process state with the front end
if (!isServerWindow) clientZustand.init()

//
//
// Stop scanning when reloaded, shouldn't be a problem with the build app,
// but just in case and for development, stop scanning when the frontend is reloaded
//
// The catch is what a module tail owes: nothing awaits this call, and a
// rejection with nothing behind it is an unhandled one. Main reports its own
// failures through `backend_message`, so a rejected invoke carries the channel
// name and nothing the user can act on.
if (!isServerWindow) {
  window.api
    .stopScanningUnitIds(selectedClientUuid())
    .catch((error) => console.error('A running scan was not stopped:', error))
}
