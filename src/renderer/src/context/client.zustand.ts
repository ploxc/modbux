/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import { v4 } from 'uuid'
import { arrayMove } from '@dnd-kit/sortable'
import {
  ClientSession,
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
  ClientUnit,
  addType,
  formatLayout,
  parseLayout,
  removeType,
  typesIn,
  newClientUnit,
  emptyRegisterMapping,
  MAIN_CLIENT_UUID,
  RegisterType
} from '@shared'
import {
  appendUnit,
  changeUnit,
  clearRegisterDataWhenIdle,
  flushUnitsToMain,
  handToMain,
  holdSelection,
  isDisconnected,
  isPlainRecord,
  nextUnitId,
  onClient,
  readWhenMainCan,
  recordField,
  selectionHeld,
  setRegisterConfigField,
  setSerialOption,
  startCall,
  syncUnitsToMain,
  viewOf,
  withDefaults
} from './client.zustand.actions'
import {
  getDefaultClient,
  layoutOf,
  openTypesOf,
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
import { sectionOf, useLiveZustand } from './live.zustand'
import { loadSerialPorts } from './serialPorts'
import { repairPersistedStore } from './repairPersistedStore'
import { useUndoZustand } from './undo.zustand'

/**
 * The version the blob on disk carried, set by `migrate` and read once below.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered.
 */
let persistedVersion: number | undefined

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
      addClient: (client = getDefaultClient()) => {
        const uuid = v4()
        handToMain(uuid, client)
        const held = selectionHeld()
        set((state) => {
          state.clients[uuid] = client
          state.sessions[uuid] = readySession(client)
          if (!held) state.selectedUuid = uuid
        })
        return uuid
      },
      moveClient: (uuid, index) => {
        set((state) => {
          const entries = Object.entries(state.clients)
          const from = entries.findIndex(([key]) => key === uuid)
          if (from === -1) return
          // A record keeps its keys in the order they were added, so the
          // sidebar's order is the record rebuilt in the new one.
          state.clients = Object.fromEntries(arrayMove(entries, from, index))
        })
      },
      duplicateClient: (uuid) => {
        const source = get().clients[uuid]
        if (!source) return undefined
        const copy = structuredClone(source)
        copy.name = source.name === '' ? '' : `${source.name} copy`
        copy.units = copy.units.map((unit) => ({ ...unit, uuid: v4() }))
        return get().addClient(copy)
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
      addUnit: (givenUnitId, name = '') => {
        const { units, connectionConfig } = selectedClient(get())
        const unitId = givenUnitId ?? nextUnitId(units, connectionConfig.protocol)
        return appendUnit(set, get, { ...newClientUnit(v4(), unitId), name })
      },
      duplicateUnit: (unit) => {
        const { units, connectionConfig } = selectedClient(get())
        const source = units.find(({ uuid }) => uuid === unit)
        if (!source) return Promise.resolve(false)
        return appendUnit(set, get, {
          ...structuredClone(source),
          uuid: v4(),
          unitId: nextUnitId(units, connectionConfig.protocol),
          name: source.name === '' ? '' : `${source.name} copy`
        })
      },
      moveUnit: async (uuid, unit, index) => {
        const client = get().clients[uuid]
        if (!client || !get().sessions[uuid]?.ready) return false
        const from = client.units.findIndex((found) => found.uuid === unit)
        if (from === -1) return false
        const units = arrayMove(client.units, from, index)
        if (!(await flushUnitsToMain(uuid, units))) return false
        const order = units.map((found) => found.uuid)
        set((state) =>
          onClient(state, uuid, ({ client: draft }) => {
            draft.units.sort((a, b) => order.indexOf(a.uuid) - order.indexOf(b.uuid))
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
            const found = client.units.find(({ uuid }) => uuid === unit)
            if (!found) return
            session.selectedUnit = unit
            const shown = typesIn(layoutOf(found))
            if (!shown.includes(session.shownType))
              session.shownType = shown[0] ?? session.shownType
          })
        )
      },
      setType: (type) => {
        const { selectedUuid } = get()
        const view = viewOf(get())
        const unit = selectedUnit(get())
        const layout = layoutOf(unit)
        const on = typesIn(layout).includes(type)
        // The last type on stays: the view always shows one.
        const next = on ? removeType(layout, type) : addType(layout, type)
        if (next === undefined) return
        set((state) =>
          onClient(state, selectedUuid, ({ client, session }) => {
            const found = client.units.find(({ uuid }) => uuid === view.unit)
            if (found) found.layout = formatLayout(next)
            if (!on) session.shownType = type
            else if (session.shownType === type) {
              session.shownType = typesIn(next)[0] ?? session.shownType
            }
          })
        )
        syncUnitsToMain(selectedUuid)
      },
      showType: (type) => {
        if (!openTypesOf(get()).includes(type)) get().setType(type)
        get().focusType(type)
      },
      focusType: (type) => {
        const { selectedUuid } = get()
        if (!openTypesOf(get()).includes(type)) return
        set((state) =>
          onClient(state, selectedUuid, ({ session }) => {
            session.shownType = type
          })
        )
      },
      setLayout: (layout) => {
        const parsed = parseLayout(layout)
        if (parsed === undefined) return
        const view = viewOf(get())
        set((state) =>
          onClient(state, view.uuid, ({ client, session }) => {
            const found = client.units.find(({ uuid }) => uuid === view.unit)
            if (found) found.layout = formatLayout(parsed)
            if (!typesIn(parsed).includes(session.shownType)) {
              session.shownType = typesIn(parsed)[0] ?? session.shownType
            }
          })
        )
        syncUnitsToMain(view.uuid)
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

export {
  layoutOf,
  openTypesOf,
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

export { flushUnitsToMain, holdSelection }

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
