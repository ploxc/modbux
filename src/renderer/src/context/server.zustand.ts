/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import {
  PersistedServerZustand,
  PersistedServerZustandSchema,
  ServerZustand,
  SetBoolParameters,
  SetRegisterValueParameters
} from './server.zustand.types'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import {
  DEFAULT_MODBUS_PORT,
  getUsedAddresses,
  MAIN_SERVER_UUID,
  ServerRegisterEntry,
  RegisterParams,
  holdsExact64Bits,
  SyncBoolsParameters,
  UnitIdString,
  SetBooleanParameters,
  migrateServerState,
  CURRENT_SERVER_ZUSTAND_VERSION,
  SERVER_ZUSTAND_STORAGE_KEY,
  registerWidth,
  MAX_NUMBER_REGISTER_WIDTH,
  ModbusBaudRate,
  RegisterType,
  RegisterValue,
  ServerRegisters,
  BooleanRegisters,
  NumberRegisters
} from '@shared'
import { onEvent } from '@renderer/events'
import { enqueueSnackbar } from 'notistack'
import {
  boolArraysOf,
  extractUnitIdsWithData,
  foldWordIntoComposite,
  getDefaultServer,
  repairServers,
  syncRegistersWithBackend,
  syncUuidToBackend,
  unitRegisters,
  unitUsedAddresses,
  getDefaultSerialConfig,
  portToOpen,
  restartRtuServer,
  setSerialOption,
  ServerDelayedSetter
} from './server.zustand.helpers'
import { loadSerialPorts } from './serialPorts'
import { repairPersistedStore } from './repairPersistedStore'
import { useUndoZustand } from './undo.zustand'
import { unitStructure } from './undo.zustand.helpers'
import { deepEqual } from 'fast-equals'

/**
 * The version the blob on disk carried, set by `migrate` and read by
 * `repairFromTheKey`.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered. A
 * key at the current version therefore leaves this where it was, which is why
 * the rehydrate clears it before re-reading: a launch off a newer blob leaves a
 * higher number here, the store re-persists at the current version, and
 * `repairPersisted` answers a reset on `savedByNewerVersion` alone.
 */
let persistedVersion: number | undefined

/**
 * Records what a unit held, when an action changed which addresses it has or
 * what they are. A value a master or a generator wrote is no step, so the
 * comparison leaves the values out.
 */
const recordUnit = (
  get: () => ServerZustand,
  uuid: string,
  unitId: UnitIdString,
  before: ServerRegisters | undefined
): void => {
  const after = get().servers[uuid]?.registers[unitId]
  if (deepEqual(unitStructure(before), unitStructure(after))) return
  useUndoZustand
    .getState()
    .recordServer({ kind: 'unit', uuid, unitId, value: withPendingValues(uuid, unitId, before) })
}

/**
 * A unit's registers with the values the batchers still hold for it.
 *
 * Main's words reach an entry after 50 ms of quiet, so a unit read off the
 * store inside that window is a word behind, and a step recorded from it would
 * put back the word before the one that had already arrived.
 */
export const withPendingValues = (
  uuid: string,
  unitId: UnitIdString,
  registers: ServerRegisters | undefined
): ServerRegisters | undefined => {
  if (registers === undefined) return undefined
  // The parameters rather than the pending composite: they hold the value in
  // the store's own form, where a 64 bit composite is a bigint and the store
  // keeps its decimal string.
  // Bools need none of it: `keepLiveValues` puts a bool back at the value the
  // store holds when the step replays, and a bool still pending then reaches
  // the store and main on its own flush after.
  const numbers = (type: NumberRegisters): ServerRegisters[NumberRegisters] =>
    Object.fromEntries(
      Object.entries(registers[type]).map(([address, entry]) => {
        const pending = delayedRegister.getParameter(batchKey(uuid, unitId, type, Number(address)))
        return [address, pending === undefined ? entry : { ...entry, value: pending.value }]
      })
    )
  return {
    ...registers,
    input_registers: numbers('input_registers'),
    holding_registers: numbers('holding_registers')
  }
}

/**
 * A unit's registers with the values it holds now kept, so putting a unit back
 * puts back its addresses and what they are, not a value a master or a
 * generator has written since. A register keeps its value only where it is the
 * same register, with the same params.
 */
const keepLiveValues = (
  registers: ServerRegisters,
  live: ServerRegisters | undefined,
  heldNow: (entry: ServerRegisterEntry) => number
): ServerRegisters => {
  const bools = (type: BooleanRegisters): ServerRegisters[BooleanRegisters] =>
    Object.fromEntries(
      Object.entries(registers[type]).map(([address, entry]) => [
        address,
        { ...entry, value: live?.[type][Number(address)]?.value ?? entry.value }
      ])
    )
  const numbers = (type: NumberRegisters): ServerRegisters[NumberRegisters] =>
    Object.fromEntries(
      Object.entries(registers[type]).map(([address, entry]) => {
        const liveEntry = live?.[type][Number(address)]
        if (liveEntry === undefined) return [address, entry]
        if (deepEqual(liveEntry.params, entry.params)) {
          return [address, { ...entry, value: liveEntry.value }]
        }
        // A step that changed a label alone gets its labels back and keeps the
        // word, with `params.value` at that word so the step that replays this
        // one reads it as left alone too.
        if (labelsOnly(liveEntry, entry)) {
          const word = heldNow(liveEntry)
          return [
            address,
            { ...entry, value: liveEntry.value, params: { ...entry.params, value: word } }
          ]
        }
        return [address, entry]
      })
    )
  return {
    coils: bools('coils'),
    discrete_inputs: bools('discrete_inputs'),
    input_registers: numbers('input_registers'),
    holding_registers: numbers('holding_registers')
  }
}

/** The params with the fields a label step can change set aside. */
const labelsOff = { value: 0, comment: '', bitMap: undefined }

/**
 * Whether the step between `live` and `restored` changed a comment or a bit
 * map and nothing else, word included.
 *
 * Main keeps a fixed register's words and none of its params, so such a step
 * has nothing to tell it, and told anyway it encodes the params' word again:
 * a utf8 register went back to the text the step saw over what a master wrote.
 * A step left the word alone when the `params.value` it holds is the word the
 * register held as it was taken, which is what a bit comment sends.
 */
type FixedEntry = ServerRegisterEntry & { params: { interval: undefined } }

const labelsOnly = (
  live: ServerRegisterEntry | undefined,
  restored: ServerRegisterEntry
): restored is FixedEntry => {
  if (live === undefined) return false
  if (live.params.interval !== undefined || restored.params.interval !== undefined) return false
  if (!deepEqual({ ...live.params, ...labelsOff }, { ...restored.params, ...labelsOff }))
    return false
  return live.params.value === Number(restored.value)
}

/**
 * The params a restored register goes back to main with.
 *
 * A value is not configuration, but a step that set one, a toggle or a value
 * typed in the dialog, is undone with the word from before it, which is the
 * word the register held when the step was taken. Anything else about the
 * register that moved, its type, its length or a generator, goes back as the
 * step saw it, and so does a 64 bit integer, which `params.value` cannot hold.
 */
const paramsToRestore = (
  live: ServerRegisterEntry | undefined,
  restored: ServerRegisterEntry
): RegisterParams => {
  const { params } = restored
  if (live === undefined || params.interval !== undefined) return params
  if (holdsExact64Bits(params.dataType)) return params
  if (!deepEqual({ ...live.params, ...labelsOff }, { ...params, ...labelsOff })) return params
  return { ...params, value: Number(restored.value) }
}

export const useServerZustand = create<
  ServerZustand,
  [['zustand/persist', PersistedServerZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      configReset: undefined,
      acknowledgeConfigReset: () =>
        set((state) => {
          state.configReset = undefined
        }),
      ready: { [MAIN_SERVER_UUID]: false },
      initialized: false,
      selectedUuid: MAIN_SERVER_UUID,
      servers: { [MAIN_SERVER_UUID]: getDefaultServer() },
      serverMode: 'tcp' as const,
      serialConfig: getDefaultSerialConfig(),
      serialPorts: [],
      serialPortsLoading: false,
      rtuServerActive: false,
      clean: (uuid) =>
        set((state) => {
          const server = state.servers[uuid]
          if (!server) return
          server.unitId = '0'
          server.registers = {}
          server.usedAddresses = {}
        }),
      createServer: async (params) => {
        // Only update port from backend response, never from input. A refused
        // payload answers undefined, and writing that would put the string
        // "undefined" in the port field.
        const actualPort = await window.api.createServer(params)
        if (actualPort === undefined) return false
        const { uuid } = params

        set((state) => {
          state.servers[uuid] = { ...getDefaultServer(), port: String(actualPort) }
          state.ready[uuid] = true
          state.selectedUuid = uuid
        })
        // The main server has no Delete button, and `init` creates it on a
        // launch with no servers, which is no step to undo.
        if (uuid !== MAIN_SERVER_UUID) {
          useUndoZustand.getState().recordServer({ kind: 'server', uuid, value: undefined })
        }
        return true
      },
      deleteServer: async (uuid) => {
        const before = get().servers[uuid]
        await window.api.deleteServer(uuid)
        if (before) useUndoZustand.getState().recordServer({ kind: 'server', uuid, value: before })
        set((state) => {
          delete state.servers[uuid]
          delete state.ready[uuid]
          // The delete button is off for the main server, so the record keeps
          // at least that one and the selection lands on a server that is
          // there.
          const [firstRemaining = MAIN_SERVER_UUID] = Object.keys(state.servers)
          if (state.selectedUuid === uuid) state.selectedUuid = firstRemaining
        })
      },
      resetServer: async (uuid) => {
        await window.api.resetServer(uuid)
        get().clean(uuid)
      },
      /**
       * Hands main what the store holds, one server at a time, and marks the
       * store initialized once it has been through them all.
       *
       * `containers/Server.tsx` draws nothing until the flag is set, so a
       * rejected invoke that escaped here would cost the whole server view
       * rather than the one uuid it belongs to, on that launch and on every one
       * after it. The uuid keeps `ready` false, which is what its three setters
       * refuse on, and that is the whole cost. `openServer` is where the catch
       * sits, so the servers after it still get opened.
       */
      init: async (uuid) => {
        set((state) => {
          if (uuid) state.ready[uuid] = false
          else for (const readyUuid of Object.keys(state.servers)) state.ready[readyUuid] = false
        })
        const state = get()
        const mode = state.serverMode ?? 'tcp'

        /**
         * Opens one server and hands main what it holds, and answers whether
         * that got through.
         *
         * The `catch` is per uuid, because that is the unit of the cost.
         * Around the loop instead, a refusal for the first uuid would leave
         * `createServer` uncalled for the second, so it would have no listener
         * on its port, none of its registers in main, and `ready` false with no
         * message.
         *
         * Empty, because this runs from module scope with nothing awaiting it
         * and a rejection there is an unhandled one. Main reports its own
         * failures through `backend_message`; a rejected invoke carries the
         * channel name and nothing the user can act on. `console.error` is what
         * says the other kind happened, a throw out of the store's own recipes.
         */
        const openServer = async (syncUuid: string, port: number): Promise<void> => {
          try {
            const actualPort = await window.api.createServer({ uuid: syncUuid, port })
            if (actualPort === undefined) return

            set((state) => {
              const server = state.servers[syncUuid]
              if (server) server.port = String(actualPort)
            })

            await syncUuidToBackend(set, get, syncUuid)
          } catch (error) {
            console.error(`Server ${syncUuid} was not opened:`, error)
          }
        }

        if (mode === 'rtu') {
          // RTU serves the main server's registers, so that is the only uuid
          // there is anything to open for.
          const serialConfig = state.serialConfig ?? getDefaultSerialConfig()

          // Only start if COM port is configured
          if (serialConfig.com.trim()) {
            try {
              await window.api.startRtuServer({ uuid: MAIN_SERVER_UUID, serialConfig })
            } catch {
              // Error is reported via backend_message event
            }
          }

          try {
            await syncUuidToBackend(set, get, MAIN_SERVER_UUID)
          } catch (error) {
            console.error(`Server ${MAIN_SERVER_UUID} was not opened:`, error)
          }

          set((state) => {
            state.selectedUuid = MAIN_SERVER_UUID
          })
        } else {
          // TCP mode: existing flow
          const uuidsToSync = uuid ? [uuid] : Object.keys(state.servers)

          for (const syncUuid of uuidsToSync) {
            await openServer(syncUuid, portToOpen(syncUuid, get().servers))
          }

          if (uuidsToSync.length === 0) {
            state.createServer({ port: DEFAULT_MODBUS_PORT, uuid: MAIN_SERVER_UUID })
            set((state) => {
              state.ready[MAIN_SERVER_UUID] = true
            })
          }
        }

        set((state) => {
          state.initialized = true
        })
      },
      setSelectedUuid: (uuid) =>
        set((state) => {
          state.selectedUuid = uuid
        }),
      setName: (name) => {
        const uuid = get().selectedUuid
        // A name never set reads as the empty one everywhere it is shown.
        const before = get().servers[uuid]?.name ?? ''
        set((state) => {
          const server = state.servers[uuid]
          if (server) server.name = name
        })
        if ((get().servers[uuid]?.name ?? '') !== before) {
          useUndoZustand.getState().recordServer({ kind: 'name', uuid, value: before })
        }
      },
      addBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const before = get().servers[uuid]?.registers[unitId]
        let added = false
        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          if (!registers) return
          if (registers[registerType][address]) return
          registers[registerType][address] = { value: false }
          added = true
        })
        if (added) window.api.setBool({ uuid, unitId, registerType, address, state: false })
        recordUnit(get, uuid, unitId, before)
        return added
      },
      removeBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const before = get().servers[uuid]?.registers[unitId]
        let removed = false
        set((state) => {
          const registers = state.servers[uuid]?.registers[unitId]
          if (registers?.[registerType][address] === undefined) return
          delete registers[registerType][address]
          removed = true
        })
        if (removed) window.api.setBool({ uuid, unitId, registerType, address, state: false })
        recordUnit(get, uuid, unitId, before)
        return removed
      },
      toggleBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const entry = get().servers[uuid]?.registers[unitId]?.[registerType][address]
        if (!entry) return
        useUndoZustand.getState().recordServer({
          kind: 'bool',
          uuid,
          unitId,
          registerType,
          address,
          value: entry.value
        })
        get().setBool({ registerType, address, boolState: !entry.value })
      },
      setBool: (params) => {
        const written: SetBooleanParameters[] = []
        set((state) => {
          for (const parameters of Array.isArray(params) ? params : [params]) {
            const { registerType, address, boolState, optionalUuid, optionalUnitId } = parameters
            const uuid = optionalUuid ?? get().selectedUuid
            const unitId = optionalUnitId ?? get().getUnitId(uuid)
            const registers = unitRegisters(state, uuid, unitId)
            if (!registers) continue
            const entry = registers[registerType][address]
            if (entry) {
              entry.value = boolState
            } else {
              registers[registerType][address] = { value: boolState }
            }
            written.push({ uuid, unitId, registerType, address, state: boolState })
          }
        })
        for (const bool of written) window.api.setBool(bool)
      },
      setBoolComment: (registerType, address, comment) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const before = get().servers[uuid]?.registers[unitId]
        set((state) => {
          const entry = state.servers[uuid]?.registers[unitId]?.[registerType]?.[address]
          if (!entry) return
          entry.comment = comment || undefined
        })
        recordUnit(get, uuid, unitId, before)
      },
      resetBools: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const before = get().servers[uuid]?.registers[unitId]
        // Read before the store is emptied, because the other type keeps the
        // values it had and main takes both arrays on every sync.
        const bools = boolArraysOf(get().servers[uuid]?.registers ?? {}, unitId)
        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          if (registers) registers[registerType] = {}
        })
        const newBools: SyncBoolsParameters = {
          uuid,
          unitId,
          ...bools,
          [registerType]: new Array(65536).fill(false)
        }
        window.api.syncBools(newBools)
        recordUnit(get, uuid, unitId, before)
      },
      addRegister: async (addParams) => {
        const { uuid, unitId, params } = addParams

        // Main answers before the store writes, so a register the schema
        // refuses leaves the grid showing what the server actually holds. The
        // shape is A3's, on the one server channel carrying a whole register.
        //
        // The answer carries the words rather than a yes, because main sends
        // the `register_value` for each of them from inside the same call, and
        // those events arrive before this one resolves. `applyRegisterValue`
        // drops a word for an address it has no entry for, so a yes would leave
        // every register reading 0 until something wrote it again.
        //
        // Whether it was taken goes back out to the caller, because Add & Next
        // asks for the next free address and that reads the map written below.
        const before = get().servers[uuid]?.registers[unitId]
        const words = await window.api.addReplaceServerRegister({ uuid, unitId, params })
        if (words === undefined) return false

        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          const addresses = unitUsedAddresses(state, uuid, unitId)
          if (!registers || !addresses) return
          registers[params.registerType][params.address] = { value: 0, params }
          addresses[params.registerType] = getUsedAddresses(
            Object.values(registers[params.registerType]).map((register) => register.params)
          )
        })
        recordUnit(get, uuid, unitId, before)

        // The entry exists now, so the words go through the merge that turns
        // them into the value the grid draws.
        for (const [offset, value] of words.entries()) {
          applyRegisterValue({
            uuid,
            unitId,
            registerType: params.registerType,
            address: params.address + offset,
            value
          })
        }

        return true
      },
      removeRegister: (removeParams) => {
        const { uuid, unitId, registerType, address } = removeParams
        const before = get().servers[uuid]?.registers[unitId]
        set((state) => {
          const registers = state.servers[uuid]?.registers[unitId]
          if (registers === undefined) return
          // After the check, because it makes the entry it answers with and a
          // unit holding no registers has no addresses to mark.
          const addresses = unitUsedAddresses(state, uuid, unitId)
          if (addresses === undefined) return
          delete registers[registerType][address]
          addresses[registerType] = getUsedAddresses(
            Object.values(registers[registerType]).map((register) => register.params)
          )
        })
        window.api.removeServerRegister(removeParams)
        recordUnit(get, uuid, unitId, before)
      },
      setRegisterValue: (params) => {
        if (!Array.isArray(params)) params = [params]
        set((state) => {
          for (const parameters of params) {
            const { registerType, address, value, optionalUuid, optionalUnitId } = parameters
            const uuid = optionalUuid ?? get().selectedUuid
            const unitId = optionalUnitId ?? get().getUnitId(uuid)

            // The address is the one level that can be gone by now. These
            // arrive batched on a 50 ms timer, and the event that proved the
            // entry existed fired before it, so a `removeRegister` or a
            // `resetRegisters` in between lands the flush on nothing.
            //
            // Dropped rather than recreated, which is what `setBool` does with
            // its own: a bool entry is a value, and a register entry carries
            // the params that say what it is. There is nothing here to build
            // one from.
            const entry = state.servers[uuid]?.registers[unitId]?.[registerType][address]
            if (!entry) continue
            entry.value = value
          }
        })
      },
      resetRegisters: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const before = get().servers[uuid]?.registers[unitId]
        window.api.resetRegisters({ uuid, unitId, registerType })
        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          const addresses = unitUsedAddresses(state, uuid, unitId)
          if (!registers || !addresses) return
          registers[registerType] = {}
          addresses[registerType] = []
        })
        recordUnit(get, uuid, unitId, before)
      },
      restoreUnit: async (uuid, unitId, registers) => {
        const live = get().servers[uuid]?.registers[unitId]
        const restored =
          registers &&
          keepLiveValues(registers, live, (entry) => pendingRegisterValue(uuid, unitId, entry))
        set((state) => {
          const server = state.servers[uuid]
          if (!server) return
          if (restored === undefined) {
            delete server.registers[unitId]
            delete server.usedAddresses[unitId]
            return
          }
          server.registers[unitId] = restored
          server.usedAddresses[unitId] = {
            input_registers: getUsedAddresses(
              Object.values(restored.input_registers).map((register) => register.params)
            ),
            holding_registers: getUsedAddresses(
              Object.values(restored.holding_registers).map((register) => register.params)
            )
          }
        })

        // Main is handed the difference, register by register, rather than the
        // unit whole: `sync_server_register` adds every register back from its
        // params, and a value a master wrote into one the step never touched
        // would go with it. Bools go whole, with the values kept above.
        const boolStructure = (unit: ServerRegisters | undefined): unknown =>
          unitStructure(unit && { ...unit, input_registers: {}, holding_registers: {} })
        if (!deepEqual(boolStructure(live), boolStructure(restored))) {
          const serverRegisters = get().servers[uuid]?.registers ?? {}
          await window.api.syncBools({ uuid, unitId, ...boolArraysOf(serverRegisters, unitId) })
        }

        for (const registerType of ['input_registers', 'holding_registers'] as const) {
          const before = live?.[registerType] ?? {}
          const after = restored?.[registerType] ?? {}
          // The step's own registers, because `restored` carries a label step's
          // params at the word held now, and that is no longer the step.
          const stepped = registers?.[registerType] ?? {}
          const labelStep = (address: number, liveEntry: ServerRegisterEntry): boolean => {
            const steppedEntry = stepped[address]
            return steppedEntry !== undefined && labelsOnly(liveEntry, steppedEntry)
          }
          // Removed first, because a moved register's two spans can overlap.
          for (const [address, entry] of Object.entries(before)) {
            const restoredEntry = after[Number(address)]
            if (deepEqual(restoredEntry?.params, entry.params)) continue
            if (labelStep(Number(address), entry)) continue
            const { dataType, length } = entry.params
            await window.api.removeServerRegister({
              uuid,
              unitId,
              registerType,
              address: Number(address),
              dataType,
              length
            })
          }
          for (const [address, entry] of Object.entries(after)) {
            const liveEntry = before[Number(address)]
            if (deepEqual(liveEntry?.params, entry.params)) continue
            // Main holds the word and none of the labels, and the store took
            // them above.
            if (liveEntry && labelStep(Number(address), liveEntry)) continue
            const params = paramsToRestore(liveEntry, entry)
            const words = await window.api.addReplaceServerRegister({ uuid, unitId, params })
            // The params main now holds, so the step that replays this one
            // compares against the word this one sent.
            set((state) => {
              const restoredEntry =
                state.servers[uuid]?.registers[unitId]?.[registerType][params.address]
              // A register written there while main answered is not this one.
              if (restoredEntry && deepEqual(restoredEntry.params, entry.params)) {
                restoredEntry.params = params
              }
            })
            // What main now holds, folded in as `addRegister` folds it, so the
            // grid does not show the value from when the step was taken.
            for (const [offset, value] of (words ?? []).entries()) {
              applyRegisterValue({
                uuid,
                unitId,
                registerType,
                address: params.address + offset,
                value
              })
            }
          }
        }
      },
      restoreServer: async (uuid, record) => {
        // The port main bound stays, because the server listens on it.
        const port = get().servers[uuid]?.port ?? record.port
        set((state) => {
          state.servers[uuid] = { ...record, port }
        })
        await get().init(uuid)
      },
      setPort: async (port) => {
        const uuid = get().selectedUuid
        if (!get().ready[uuid]) return false

        const servers = get().servers
        if (port === servers[uuid]?.port) return true

        // The check stays here, because `setPort` has a second caller in
        // `PrivilegedPortModal` and a rule written in the field is one that
        // caller does not run. The message goes where the check is: the
        // standalone `enqueueSnackbar` is what a store can reach, and both
        // callers are a click, which is after `main.tsx` has built the
        // provider. `repairPersistedStore` says why module scope cannot.
        if (Object.values(servers).some((server) => server.port === port)) {
          enqueueSnackbar({
            message: `Port ${port} is already used by another server`,
            variant: 'error'
          })
          return false
        }

        // Only update port from backend response
        const before = servers[uuid]?.port
        const actualPort = await window.api.setServerPort({ uuid, port: Number(port) })
        if (actualPort === undefined) return false

        set((state) => {
          const server = state.servers[uuid]
          if (server) server.port = String(actualPort)
        })
        if (before !== undefined && get().servers[uuid]?.port !== before) {
          useUndoZustand.getState().recordServer({ kind: 'port', uuid, value: before })
        }
        // Main refuses a port by answering the one the server kept, not
        // `undefined`, so a refusal is a port other than the one asked for.
        return actualPort === Number(port)
      },
      setUnitId: (unitId) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return
        set((state) => {
          const server = state.servers[uuid]
          if (server) server.unitId = unitId
        })
      },
      setLittleEndian: async (littleEndian) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return false

        const before = currentState.servers[uuid]?.littleEndian
        set((state) => {
          const server = state.servers[uuid]
          if (server) server.littleEndian = littleEndian
        })
        if (before !== undefined && before !== littleEndian) {
          useUndoZustand.getState().recordServer({ kind: 'littleEndian', uuid, value: before })
        }

        // Told before the registers are sent, because main encodes them with
        // the order it holds at that moment.
        await window.api.setServerEndianness({ uuid, littleEndian })

        const serverRegisters = currentState.servers[uuid]?.registers
        if (!serverRegisters) return true

        const unitIdsWithData = extractUnitIdsWithData(serverRegisters)

        for (const unitId of unitIdsWithData) {
          await syncRegistersWithBackend(serverRegisters, unitId, uuid)
        }
        return true
      },
      replaceServerRegisters: (unitId, registers) => {
        const uuid = get().selectedUuid
        set((state) => {
          const server = state.servers[uuid]
          if (server) server.registers[unitId] = registers
        })
      },
      switchToRtu: async () => {
        await window.api.stopAllTcpServers()
        set((state) => {
          state.serverMode = 'rtu'
        })
        await get().init()
      },
      switchToTcp: async () => {
        await window.api.stopRtuServer()
        set((state) => {
          state.serverMode = 'tcp'
        })
        await get().init()
      },
      setServerCom: (com) => {
        set((state) => {
          if (!state.serialConfig) state.serialConfig = getDefaultSerialConfig()
          state.serialConfig.com = com
        })
        // State-only — applied on blur via applyServerCom
      },
      applyServerCom: () => restartRtuServer(get),
      setServerBaudRate: (baudRate: ModbusBaudRate) =>
        setSerialOption(set, get, 'baudRate', baudRate),
      setServerParity: (parity) => setSerialOption(set, get, 'parity', parity),
      setServerDataBits: (dataBits) => setSerialOption(set, get, 'dataBits', dataBits),
      setServerStopBits: (stopBits) => setSerialOption(set, get, 'stopBits', stopBits),
      refreshSerialPorts: () => loadSerialPorts(set),
      /**
       * A read, and nothing else.
       *
       * Two of its callers ask from inside a running recipe, where a `set`
       * made here would be discarded and attempted again on the next call.
       * Every server carries a unit id, so the fallback answers for a uuid
       * that names no server rather than for a server with no unit id.
       */
      getUnitId: (uuid: string): UnitIdString => get().servers[uuid]?.unitId ?? '0'
    })),
    {
      name: SERVER_ZUSTAND_STORAGE_KEY,
      version: CURRENT_SERVER_ZUSTAND_VERSION,
      migrate: (persistedState, version) => {
        persistedVersion = version
        return migrateServerState(persistedState, version) as PersistedServerZustand
      },
      partialize: (state) => ({
        selectedUuid: state.selectedUuid,
        servers: state.servers,
        serverMode: state.serverMode,
        serialConfig: state.serialConfig
      })
    }
  )
)

const serverZustand = useServerZustand.getState()

/**
 * Keep the fields that parsed and default the rest, then say which went.
 *
 * Called at load and again after the `window_update` rehydrate, which is the
 * store's second way in. `MessageReceiver` selects `configReset`, so a reset
 * found at the close is told the same way one found at load is.
 */
const repairFromTheKey = (): void => {
  // Each server read back on its own first. `repairPersisted` works a top
  // level field at a time and `servers` is the one field holding all of them,
  // so read whole, one register the schema refuses would cost every port,
  // every name and every register in the store.
  //
  // Handed over rather than written through the store, because a `setState`
  // here persists, and the copy `keepCorrupt` takes is of the key.
  const currentState = useServerZustand.getState()
  const repairedServers = repairServers(currentState.servers)

  const repair = repairPersistedStore(useServerZustand, PersistedServerZustandSchema, {
    storageKey: SERVER_ZUSTAND_STORAGE_KEY,
    persistedVersion,
    currentVersion: CURRENT_SERVER_ZUSTAND_VERSION,
    state: repairedServers && { ...currentState, servers: repairedServers.servers },
    alsoReset: repairedServers?.fields
  })
  if (repair) useServerZustand.setState({ ...repair.state, configReset: repair.reset })
}

repairFromTheKey()

/**
 * What the split out server window does in place of `init`: ask main which
 * servers the main window opened, and mark those ready.
 *
 * `init` opens every server and sends main this window's persisted copy of its
 * registers. In RTU mode that restarts the RTU server, because
 * `RtuServer.start` stops the running one first. In RTU mode the main server is
 * ready whether or not its port opened, as `init` has it.
 */
const adoptMainServers = async (): Promise<void> => {
  const { serverMode, servers } = useServerZustand.getState()
  if (serverMode === 'rtu') {
    useServerZustand.setState({
      ready: { [MAIN_SERVER_UUID]: true },
      selectedUuid: MAIN_SERVER_UUID,
      initialized: true
    })
    return
  }
  const ports = await window.api.getServerPorts()
  useServerZustand.setState({
    ready: Object.fromEntries(Object.keys(servers).map((uuid) => [uuid, uuid in ports])),
    initialized: true
  })
}

if (window.api.isServerWindow) {
  adoptMainServers().catch((error) => console.error('Asking main for its servers failed:', error))
} else {
  useServerZustand.getState().init()
}

const delayedBool = new ServerDelayedSetter<boolean, SetBoolParameters>({
  maxCount: 250,
  set: serverZustand.setBool
})

const delayedRegister = new ServerDelayedSetter<number | bigint, SetRegisterValueParameters>({
  maxCount: 250,
  set: serverZustand.setRegisterValue
})

/** What a value pending in either batcher is filed under. */
const batchKey = (
  uuid: string,
  unitId: UnitIdString,
  registerType: RegisterType,
  address: number
): string => `${uuid}-${unitId}-${registerType}-${address}`

/**
 * The value the entry is about to hold, for a reader that cannot wait.
 *
 * `entry.value` is behind by whatever the batcher is holding, and the batcher
 * hands over after 50 ms of quiet on any register. A reader that only draws the
 * value can be behind; one that derives its next value from this one cannot,
 * because the word it writes back would drop everything written since.
 */
export const pendingRegisterValue = (
  uuid: string,
  unitId: UnitIdString,
  entry: ServerRegisterEntry
): number =>
  Number(
    delayedRegister.getValue(
      batchKey(uuid, unitId, entry.params.registerType, entry.params.address)
    ) ?? entry.value
  )

/**
 * Folds one word main wrote into the entry that holds the address.
 *
 * Two callers: the `register_value` event, and `addRegister`, which replays the
 * words main answers with. Main sends those events from inside the call the
 * store is waiting on, so they arrive before the entry exists and are dropped
 * here for want of one.
 */
export const applyRegisterValue = (payload: RegisterValue): void => {
  const serverZustand = useServerZustand.getState()

  // Handle coils and discrete inputs
  if (payload.registerType === 'coils' || payload.registerType === 'discrete_inputs') {
    const { uuid, unitId, registerType, address, value: booleanValue } = payload
    const entry = serverZustand.servers[uuid]?.registers[unitId]?.[registerType]?.[address]
    if (entry === undefined) return

    const cacheKey = batchKey(uuid, unitId, registerType, address)
    const currentBool = delayedBool.getValue(cacheKey) ?? entry.value

    if (currentBool !== booleanValue) {
      delayedBool.setValue(cacheKey, booleanValue)

      delayedBool.setParameter(cacheKey, {
        registerType,
        address,
        boolState: booleanValue,
        optionalUuid: uuid,
        optionalUnitId: unitId
      })

      delayedBool.trigger()
    }

    return
  }

  // Handle input and holding registers
  const { uuid, unitId, registerType, address, value: numberValue } = payload

  // 1) Find the base entry in state.servers[*].registers[*][registerType] this
  //    word belongs to. A register covers its own address and the ones after
  //    it, so the base is this address or one of the
  //    `MAX_NUMBER_REGISTER_WIDTH - 1` before it.
  let serverRegisterEntry: ServerRegisterEntry | undefined
  let entryAddress: number | undefined

  for (
    let candidateAddress = address;
    candidateAddress > address - MAX_NUMBER_REGISTER_WIDTH;
    candidateAddress--
  ) {
    const candidateEntry =
      serverZustand.servers[uuid]?.registers[unitId]?.[registerType]?.[candidateAddress]
    if (!candidateEntry) continue
    // Found an entry at candidate index—this is our base
    serverRegisterEntry = candidateEntry
    entryAddress = candidateAddress
    break
  }
  if (!serverRegisterEntry || entryAddress === undefined) {
    return
  }

  // Extract the parameters and current composite value (from cache when state isn't updated yet)
  const cacheKey = batchKey(uuid, unitId, registerType, entryAddress)
  const currentValue = delayedRegister.getValue(cacheKey) ?? serverRegisterEntry.value
  const { dataType } = serverRegisterEntry.params
  // Get littleEndian from global server state
  const littleEndian = serverZustand.servers[uuid]?.littleEndian ?? false

  // Skip composite merging for types that don't use numeric compositing
  if (dataType === 'utf8') return // Strings: no composite value
  if (dataType === 'none') return // No data type, nothing to compose

  // 2) Determine which register-offset was written
  const offsetRegisters = address - entryAddress
  if (offsetRegisters < 0 || offsetRegisters >= registerWidth(dataType)) {
    // Out of range for this composite entry, ignore
    return
  }

  // 3) Overwrite that one word in the stored composite and read the value back
  const folded = foldWordIntoComposite({
    currentValue,
    dataType,
    littleEndian,
    offsetRegisters,
    word: numberValue
  })
  if (!folded) return
  const { composite: newComposite, value } = folded

  delayedRegister.setValue(cacheKey, newComposite)

  delayedRegister.setParameter(cacheKey, {
    registerType,
    address: entryAddress,
    value,
    optionalUuid: uuid,
    optionalUnitId: unitId
  })

  delayedRegister.trigger()
}

onEvent('register_value', applyRegisterValue)

// RTU server status
onEvent('rtu_server_status', (active) => {
  useServerZustand.setState({ rtuServerActive: active })
})

/**
 * Ask main whether the RTU server is up.
 *
 * `rtu_server_status` fires on a change and goes to the window showing the
 * server, so a window that was not that window at the last change never heard
 * it. Both moments where that leaves a wrong dot ask here: a window coming up,
 * and the main window taking the view back from the split out one.
 */
const readRtuServerStatus = async (): Promise<void> => {
  const active = await window.api.getRtuServerStatus()
  useServerZustand.setState({ rtuServerActive: active })
}

readRtuServerStatus()

/** Whether a split out server window has been the one writing the key. */
let serverWindowOwnsTheKey = false

/**
 * Mark the uuids the rehydrate introduced as ones main knows.
 *
 * `ready` is not in `partialize`, so a rehydrate brings back `servers` and
 * `selectedUuid` and leaves this window's own `ready` where `init` left it.
 * A server made in the split out window therefore came back with no entry, and
 * `setPort`, `setUnitId` and `setLittleEndian` each refuse on that with no
 * message, until a restart. The window that made it ran `createServer` for it,
 * so main does know it.
 *
 * Only where the entry is missing. A uuid this window's own `init` wrote
 * `false` for is one main refused, and writing `true` over that would hand the
 * three setters back for a server main has no listener for, and flip the flag
 * `PrivilegedPortModal` runs its check on.
 */
const markRehydratedUuidsReady = (): void => {
  const { servers, ready } = useServerZustand.getState()
  const introduced = Object.keys(servers).filter((uuid) => ready[uuid] === undefined)
  if (introduced.length === 0) return
  useServerZustand.setState({
    ready: { ...ready, ...Object.fromEntries(introduced.map((uuid) => [uuid, true])) }
  })
}

/**
 * Re-read the key the split out window has been writing.
 *
 * Both windows hold this store and both persist it, and main addresses the two
 * events that change it to the window showing the server. So while the split is
 * up this copy hears nothing, and the moment that window closes the events come
 * back here and write what this copy has held since load. Measured 16 Sep 2026
 * without this: a register added in the split out window stood in the key at
 * the close and was gone from it three seconds later.
 */
onEvent('window_update', ({ server }) => {
  if (window.api.isServerWindow) return
  if (server) {
    serverWindowOwnsTheKey = true
    return
  }
  if (!serverWindowOwnsTheKey) return
  serverWindowOwnsTheKey = false
  persistedVersion = undefined
  void Promise.resolve(useServerZustand.persist.rehydrate())
    .then(() => {
      repairFromTheKey()
      markRehydratedUuidsReady()
    })
    // `rehydrate` reads the key and runs `migrateServerState` over what it
    // finds, and either can throw on a blob a hand edit left there. Unhandled,
    // that is the window's only sign that the re-read did not happen.
    .catch((error) => console.error('Re-reading the server store failed:', error))
  readRtuServerStatus()
})
