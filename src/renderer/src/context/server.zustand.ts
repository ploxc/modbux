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
  RegisterValue
} from '@shared'
import { onEvent } from '@renderer/events'
import { enqueueSnackbar } from 'notistack'
import {
  boolArraysOf,
  extractUnitIdsWithData,
  foldWordIntoComposite,
  serverRegistersOf,
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
      uuids: [MAIN_SERVER_UUID],
      port: { [MAIN_SERVER_UUID]: String(DEFAULT_MODBUS_PORT) },
      unitId: { [MAIN_SERVER_UUID]: undefined },
      serverRegisters: { [MAIN_SERVER_UUID]: undefined },
      usedAddresses: { [MAIN_SERVER_UUID]: undefined },
      name: { [MAIN_SERVER_UUID]: undefined },
      littleEndian: { [MAIN_SERVER_UUID]: false },
      serverMode: 'tcp' as const,
      serialConfig: getDefaultSerialConfig(),
      serialPorts: [],
      serialPortsLoading: false,
      rtuServerActive: false,
      clean: (uuid) =>
        set((state) => {
          state.unitId[uuid] = '0'
          state.serverRegisters[uuid] = {}
          state.usedAddresses[uuid] = {}
        }),
      /**
       * Drops every entry keyed by a uuid the store no longer lists.
       *
       * The key set is every record's own keys rather than `port`'s alone: a
       * server whose `createServer` was refused has a name and no port, and
       * `name` is persisted, so an entry that escapes here stays in the config
       * file.
       */
      cleanOrphanedServerState: () => {
        set((state) => {
          const uuids = state.uuids
          const keyed = [
            state.port,
            state.unitId,
            state.serverRegisters,
            state.usedAddresses,
            state.name,
            state.littleEndian,
            state.ready
          ]
          const orphans = new Set(keyed.flatMap((record) => Object.keys(record)))

          for (const uuid of orphans) {
            if (uuids.includes(uuid)) continue
            for (const record of keyed) delete record[uuid]
          }
        })
      },
      createServer: async (params) => {
        // Only update port from backend response, never from input. A refused
        // payload answers undefined, and writing that would put the string
        // "undefined" in the port field.
        const actualPort = await window.api.createServer(params)
        if (actualPort === undefined) return
        const { uuid } = params

        set((state) => {
          state.port[uuid] = String(actualPort)
          state.ready[uuid] = true
          state.uuids.push(uuid)
          state.selectedUuid = uuid
        })
        // `clean` writes through a `set` of its own, and a `set` that runs
        // inside a recipe is discarded when that recipe finalises, so it is
        // called after this one rather than inside it.
        get().clean(uuid)
        get().cleanOrphanedServerState()
      },
      deleteServer: async (uuid) => {
        await window.api.deleteServer(uuid)
        set((state) => {
          state.uuids = state.uuids.filter((existingUuid) => existingUuid !== uuid)
          // The delete button is off for the main server, so the list keeps at
          // least that one and the selection lands on a server that is there.
          const [firstRemaining = MAIN_SERVER_UUID] = state.uuids
          if (state.selectedUuid === uuid) state.selectedUuid = firstRemaining
        })
        // What the uuid keeps is one list, and it is the orphan sweep's. This
        // deleted five of the seven records itself and left `name` and `ready`
        // to a sweep that reads `port` for its key set, which this had just
        // taken the uuid out of.
        get().cleanOrphanedServerState()
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
          else for (const readyUuid of state.uuids) state.ready[readyUuid] = false
        })
        const state = get()
        const mode = state.serverMode ?? 'tcp'

        // Ensure every uuid has a unitId and littleEndian entry (for backward compatibility)
        set((state) => {
          for (const uuid of state.uuids) {
            if (state.unitId[uuid] === undefined) {
              state.unitId[uuid] = '0'
            }
            if (state.littleEndian[uuid] === undefined) {
              state.littleEndian[uuid] = false // Default to Big-Endian
            }
          }
        })

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
              state.port[syncUuid] = String(actualPort)
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
          const uuidsToSync = uuid ? [uuid] : state.uuids

          for (const syncUuid of uuidsToSync) {
            await openServer(syncUuid, portToOpen(syncUuid, get().port))
          }

          if (state.uuids.length === 0) {
            state.createServer({ port: DEFAULT_MODBUS_PORT, uuid: MAIN_SERVER_UUID })
            set((state) => {
              state.ready[MAIN_SERVER_UUID] = true
            })
          }
        }

        get().cleanOrphanedServerState()

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
        set((state) => {
          state.name[uuid] = name
        })
      },
      addBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        let added = false
        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          if (registers[registerType][address]) return
          registers[registerType][address] = { value: false }
          added = true
        })
        if (added) window.api.setBool({ uuid, unitId, registerType, address, state: false })
      },
      removeBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        let removed = false
        set((state) => {
          const registers = state.serverRegisters[uuid]?.[unitId]
          if (registers?.[registerType][address] === undefined) return
          delete registers[registerType][address]
          removed = true
        })
        if (removed) window.api.setBool({ uuid, unitId, registerType, address, state: false })
      },
      setBool: (params) => {
        const written: SetBooleanParameters[] = []
        set((state) => {
          for (const parameters of Array.isArray(params) ? params : [params]) {
            const { registerType, address, boolState, optionalUuid, optionalUnitId } = parameters
            const uuid = optionalUuid ?? get().selectedUuid
            const unitId = optionalUnitId ?? get().getUnitId(uuid)
            const registers = unitRegisters(state, uuid, unitId)
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
        set((state) => {
          const entry = state.serverRegisters[uuid]?.[unitId]?.[registerType]?.[address]
          if (!entry) return
          entry.comment = comment || undefined
        })
      },
      resetBools: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        // Read before the store is emptied, because the other type keeps the
        // values it had and main takes both arrays on every sync.
        const bools = boolArraysOf(get().serverRegisters[uuid] ?? {}, unitId)
        set((state) => {
          unitRegisters(state, uuid, unitId)[registerType] = {}
        })
        const newBools: SyncBoolsParameters = {
          uuid,
          unitId,
          ...bools,
          [registerType]: new Array(65536).fill(false)
        }
        window.api.syncBools(newBools)
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
        const words = await window.api.addReplaceServerRegister({ uuid, unitId, params })
        if (words === undefined) return false

        set((state) => {
          const registers = unitRegisters(state, uuid, unitId)
          registers[params.registerType][params.address] = { value: 0, params }
          unitUsedAddresses(state, uuid, unitId)[params.registerType] = getUsedAddresses(
            Object.values(registers[params.registerType]).map((register) => register.params)
          )
        })

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
        set((state) => {
          const registers = state.serverRegisters[uuid]?.[unitId]
          if (registers === undefined) return
          delete registers[registerType][address]
          unitUsedAddresses(state, uuid, unitId)[registerType] = getUsedAddresses(
            Object.values(registers[registerType]).map((register) => register.params)
          )
        })
        window.api.removeServerRegister(removeParams)
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
            const entry = state.serverRegisters[uuid]?.[unitId]?.[registerType][address]
            if (!entry) continue
            entry.value = value
          }
        })
      },
      resetRegisters: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        window.api.resetRegisters({ uuid, unitId, registerType })
        set((state) => {
          unitRegisters(state, uuid, unitId)[registerType] = {}
          unitUsedAddresses(state, uuid, unitId)[registerType] = []
        })
      },
      setPort: async (port) => {
        const uuid = get().selectedUuid
        if (!get().ready[uuid]) return

        // Read after the sweep rather than before it: a port only an orphaned
        // uuid still held is not a port another server holds.
        get().cleanOrphanedServerState()
        const currentPorts = get().port

        if (port === currentPorts[uuid]) return

        // The check stays here, because `setPort` has a second caller in
        // `PrivilegedPortModal` and a rule written in the field is one that
        // caller does not run. The message goes where the check is: the
        // standalone `enqueueSnackbar` is what a store can reach, and both
        // callers are a click, which is after `main.tsx` has built the
        // provider. `repairPersistedStore` says why module scope cannot.
        if (Object.values(currentPorts).includes(port)) {
          enqueueSnackbar({
            message: `Port ${port} is already used by another server`,
            variant: 'error'
          })
          return
        }

        // Only update port from backend response
        const actualPort = await window.api.setServerPort({ uuid, port: Number(port) })
        if (actualPort === undefined) return

        set((state) => {
          state.port[uuid] = String(actualPort)
        })
      },
      setUnitId: (unitId) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return
        set((state) => {
          state.unitId[uuid] = unitId
        })
      },
      setLittleEndian: async (littleEndian) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return

        set((state) => {
          state.littleEndian[uuid] = littleEndian
        })

        // Told before the registers are sent, because main encodes them with
        // the order it holds at that moment.
        await window.api.setServerEndianness({ uuid, littleEndian })

        const serverRegisters = currentState.serverRegisters[uuid]
        if (!serverRegisters) return

        const unitIdsWithData = extractUnitIdsWithData(serverRegisters)

        for (const unitId of unitIdsWithData) {
          await syncRegistersWithBackend(serverRegisters, unitId, uuid)
        }
      },
      replaceServerRegisters: (unitId, registers) => {
        const uuid = get().selectedUuid
        set((state) => {
          serverRegistersOf(state, uuid)[unitId] = registers
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
       * `init` gives every uuid a unit id and `clean` gives a new one `'0'`, so
       * there is nothing left for it to repair.
       */
      getUnitId: (uuid: string): UnitIdString => get().unitId[uuid] ?? '0'
    })),
    {
      name: SERVER_ZUSTAND_STORAGE_KEY,
      version: CURRENT_SERVER_ZUSTAND_VERSION,
      migrate: (persistedState, version) => {
        persistedVersion = version
        return migrateServerState(persistedState, version) as PersistedServerZustand
      },
      partialize: (state) => ({
        name: state.name,
        port: state.port,
        selectedUuid: state.selectedUuid,
        serverRegisters: state.serverRegisters,
        unitId: state.unitId,
        usedAddresses: state.usedAddresses,
        uuids: state.uuids,
        littleEndian: state.littleEndian,
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
  const repair = repairPersistedStore(useServerZustand, PersistedServerZustandSchema, {
    storageKey: SERVER_ZUSTAND_STORAGE_KEY,
    persistedVersion,
    currentVersion: CURRENT_SERVER_ZUSTAND_VERSION
  })
  if (repair) useServerZustand.setState({ ...repair.state, configReset: repair.reset })
}

repairFromTheKey()

// Init server
useServerZustand.getState().init()

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
    const entry = serverZustand.serverRegisters[uuid]?.[unitId]?.[registerType]?.[address]
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

  // 1) Find the base entry in state.serverRegisters[*][*][registerType] this
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
      serverZustand.serverRegisters[uuid]?.[unitId]?.[registerType]?.[candidateAddress]
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
  const littleEndian = serverZustand.littleEndian[uuid] ?? false

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
 * `ready` is not in `partialize`, so a rehydrate brings back `uuids`, `port`
 * and `selectedUuid` and leaves this window's own `ready` where `init` left it.
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
  const { uuids, ready } = useServerZustand.getState()
  const introduced = uuids.filter((uuid) => ready[uuid] === undefined)
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
