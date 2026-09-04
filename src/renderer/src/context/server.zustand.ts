/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import {
  PersistedServerZustand,
  PersistedServerZustandSchema,
  ServerZustand,
  SetBoolParameters,
  SetRegisterValueParameters,
  UsedAddresses
} from './server.zustand.types'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import {
  getUsedAddresses,
  MAIN_SERVER_UUID,
  ServerRegisterEntry,
  ServerRegisters,
  SyncBoolsParameters,
  UnitIdString,
  UnitIdStringSchema,
  migrateServerRegistersState,
  migrateServerModeState,
  migrateBoolShape,
  repairPersistedParity,
  dropUnservableRegisters,
  CURRENT_SERVER_ZUSTAND_VERSION,
  SERVER_ZUSTAND_STORAGE_KEY,
  registerWidth,
  ServerSerialConfig,
  ModbusBaudRate,
  keepCorrupt,
  repairPersisted
} from '@shared'
import { onEvent } from '@renderer/events'
import { round } from 'lodash'
import {
  extractUnitIdsWithData,
  syncBoolsWithBackend,
  syncRegistersWithBackend
} from './server.zustand.helpers'

const getDefaultServerRegisters = (): ServerRegisters => ({
  coils: {},
  discrete_inputs: {},
  input_registers: {},
  holding_registers: {}
})

const defaultSerialConfig: ServerSerialConfig = {
  com: '',
  options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
}

const getDefaultUsedAddresses = (): UsedAddresses => ({
  input_registers: [],
  holding_registers: []
})

/** Restart RTU server only if in RTU mode and COM port is set */
const restartRtuIfActive = (get: () => ServerZustand): void => {
  const state = get()
  if (state.serverMode !== 'rtu') return
  const serialConfig = state.serialConfig ?? defaultSerialConfig
  if (!serialConfig.com.trim()) return
  window.api.stopRtuServer().then(() => {
    window.api.startRtuServer({ uuid: MAIN_SERVER_UUID, serialConfig })
  })
}

/**
 * The version the blob on disk carried, set by `migrate` and read once below.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered.
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
      selectedUuid: MAIN_SERVER_UUID,
      uuids: [MAIN_SERVER_UUID],
      port: { [MAIN_SERVER_UUID]: '502' },
      unitId: { [MAIN_SERVER_UUID]: undefined },
      serverRegisters: { [MAIN_SERVER_UUID]: undefined },
      usedAddresses: { [MAIN_SERVER_UUID]: undefined },
      name: { [MAIN_SERVER_UUID]: undefined },
      littleEndian: { [MAIN_SERVER_UUID]: false },
      serverMode: 'tcp' as const,
      serialConfig: defaultSerialConfig,
      serverSerialPorts: [],
      serverSerialPortsLoading: false,
      rtuServerActive: false,
      clean: (uuid) =>
        set((state) => {
          state.unitId[uuid] = '0'
          state.serverRegisters[uuid] = {}
          state.usedAddresses[uuid] = {}
          for (const unitId of UnitIdStringSchema.options) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
            state.usedAddresses[uuid][unitId] = getDefaultUsedAddresses()
          }
        }),
      /**
       * Remove all state entries for uuids that are not present in the uuids array.
       * This prevents memory leaks and UI bugs from stale state.
       */
      cleanOrphanedServerState: () => {
        set((state) => {
          const uuids = state.uuids
          Object.keys(state.port).forEach((uuid) => {
            if (!uuids.includes(uuid)) {
              delete state.port[uuid]
              delete state.unitId[uuid]
              delete state.serverRegisters[uuid]
              delete state.usedAddresses[uuid]
              delete state.name[uuid]
              delete state.littleEndian[uuid]
            }
          })
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
          get().clean(uuid)
          state.uuids.push(uuid)
          state.selectedUuid = uuid
        })
        get().cleanOrphanedServerState()
      },
      deleteServer: async (uuid) => {
        await window.api.deleteServer(uuid)
        set((state) => {
          state.uuids = state.uuids.filter((u) => u !== uuid)
          // The delete button is off for the main server, so the list keeps at
          // least that one and the selection lands on a server that is there.
          const [firstRemaining = MAIN_SERVER_UUID] = state.uuids
          if (state.selectedUuid === uuid) state.selectedUuid = firstRemaining
          delete state.port[uuid]
          delete state.unitId[uuid]
          delete state.serverRegisters[uuid]
          delete state.usedAddresses[uuid]
          delete state.littleEndian[uuid]
        })
        get().cleanOrphanedServerState()
      },
      init: async (uuid) => {
        set((state) => {
          if (uuid) state.ready[uuid] = false
          else for (const u of state.uuids) state.ready[u] = false
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

        if (mode === 'rtu') {
          // RTU mode: start RTU server with main server UUID
          const serialConfig = state.serialConfig ?? defaultSerialConfig
          const syncUuid = MAIN_SERVER_UUID

          // Only start if COM port is configured
          if (serialConfig.com.trim()) {
            try {
              await window.api.startRtuServer({ uuid: syncUuid, serialConfig })
            } catch {
              // Error is reported via backend_message event
            }
          }

          // Sync registers for main server
          let serverRegisters = state.serverRegisters[syncUuid]
          if (!serverRegisters) {
            serverRegisters = {}
            set((state) => {
              state.serverRegisters[syncUuid] = {}
            })
          }

          const unitIdsWithData = extractUnitIdsWithData(serverRegisters)
          for (const unitId of unitIdsWithData) {
            await syncBoolsWithBackend(serverRegisters, unitId, syncUuid)
            const littleEndian = !!state.littleEndian[syncUuid]
            const { inputRegisterRegisterValues, holdingRegisterRegisterValues } =
              await syncRegistersWithBackend(serverRegisters, unitId, syncUuid, littleEndian)

            const inputUsedAddresses = getUsedAddresses(inputRegisterRegisterValues)
            const holdingUsedAddresses = getUsedAddresses(holdingRegisterRegisterValues)

            set((state) => {
              if (!state.usedAddresses[syncUuid]) state.usedAddresses[syncUuid] = {}
              if (!state.usedAddresses[syncUuid][unitId]) state.usedAddresses[syncUuid][unitId] = {}
              state.usedAddresses[syncUuid][unitId]['input_registers'] = inputUsedAddresses
              state.usedAddresses[syncUuid][unitId]['holding_registers'] = holdingUsedAddresses
            })
          }

          set((state) => {
            state.ready[syncUuid] = true
            state.selectedUuid = syncUuid
          })
        } else {
          // TCP mode: existing flow
          const uuidsToSync = uuid ? [uuid] : state.uuids

          for (const syncUuid of uuidsToSync) {
            const port = Number(state.port[syncUuid])
            const actualPort = await window.api.createServer({ uuid: syncUuid, port })
            if (actualPort === undefined) continue

            set((state) => {
              state.port[syncUuid] = String(actualPort)
            })

            let serverRegisters = state.serverRegisters[syncUuid]
            if (!serverRegisters) {
              serverRegisters = {}
              set((state) => {
                state.serverRegisters[syncUuid] = {}
              })
            }

            const unitIdsWithData = extractUnitIdsWithData(serverRegisters)

            for (const unitId of unitIdsWithData) {
              await syncBoolsWithBackend(serverRegisters, unitId, syncUuid)
              const littleEndian = !!state.littleEndian[syncUuid]
              const { inputRegisterRegisterValues, holdingRegisterRegisterValues } =
                await syncRegistersWithBackend(serverRegisters, unitId, syncUuid, littleEndian)

              const inputUsedAddresses = getUsedAddresses(inputRegisterRegisterValues)
              const holdingUsedAddresses = getUsedAddresses(holdingRegisterRegisterValues)

              set((state) => {
                if (!state.usedAddresses[syncUuid]) state.usedAddresses[syncUuid] = {}
                if (!state.usedAddresses[syncUuid][unitId])
                  state.usedAddresses[syncUuid][unitId] = {}
                state.usedAddresses[syncUuid][unitId]['input_registers'] = inputUsedAddresses
                state.usedAddresses[syncUuid][unitId]['holding_registers'] = holdingUsedAddresses
              })
            }

            set((state) => {
              state.ready[syncUuid] = true
            })
          }

          if (state.uuids.length === 0) {
            state.createServer({ port: 502, uuid: MAIN_SERVER_UUID })
            set((state) => {
              state.ready[MAIN_SERVER_UUID] = true
            })
          }
        }

        get().cleanOrphanedServerState()
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
        set((state) => {
          if (state.serverRegisters[uuid]?.[unitId]?.[registerType][address]) return
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
          }
          state.serverRegisters[uuid][unitId][registerType][address] = { value: false }
          window.api.setBool({ uuid, unitId, registerType, address, state: false })
        })
      },
      removeBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        set((state) => {
          if (state.serverRegisters[uuid]?.[unitId]?.[registerType][address] === undefined) return
          delete state.serverRegisters[uuid][unitId][registerType][address]
          window.api.setBool({ uuid, unitId, registerType, address, state: false })
        })
      },
      setBool: (params) => {
        set((state) => {
          if (!Array.isArray(params)) params = [params]

          for (const p of params) {
            const { registerType, address, boolState, optionalUuid, optionalUnitId } = p
            const uuid = optionalUuid ?? get().selectedUuid
            const unitId = optionalUnitId ?? get().getUnitId(uuid)
            if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
            if (!state.serverRegisters[uuid][unitId]) {
              state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
            }
            const entry = state.serverRegisters[uuid][unitId][registerType][address]
            if (entry) {
              entry.value = boolState
            } else {
              state.serverRegisters[uuid][unitId][registerType][address] = { value: boolState }
            }
            window.api.setBool({ uuid, unitId, registerType, address, state: boolState })
          }
        })
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
        const currentState = get()
        const currentCoils = new Array(65536).fill(false)
        const currentDiscreteInputs = new Array(65536).fill(false)
        Object.entries(currentState.serverRegisters[uuid]?.[unitId]?.coils ?? {}).forEach(
          ([k, v]) => {
            currentCoils[Number(k)] = v.value
          }
        )
        Object.entries(
          currentState.serverRegisters[uuid]?.[unitId]?.['discrete_inputs'] ?? {}
        ).forEach(([k, v]) => {
          currentDiscreteInputs[Number(k)] = v.value
        })
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
          }
          state.serverRegisters[uuid][unitId][registerType] = {}
          const newBools: SyncBoolsParameters = {
            uuid,
            unitId,
            coils: currentCoils,
            discrete_inputs: currentDiscreteInputs,
            [registerType]: new Array(65536).fill(false)
          }
          window.api.syncBools(newBools)
        })
      },
      addRegister: async (addParams) => {
        const { uuid, unitId, params } = addParams
        // Get littleEndian from global state
        const littleEndian = get().littleEndian[uuid] ?? false

        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
          }
          state.serverRegisters[uuid][unitId][params.registerType][params.address] = {
            value: 0,
            params
          }
          // Update used addresses
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid][unitId][params.registerType]).map(
              (r) => r.params
            )
          )
          if (!state.usedAddresses[uuid]) state.usedAddresses[uuid] = {}
          if (!state.usedAddresses[uuid][unitId]) state.usedAddresses[uuid][unitId] = {}
          state.usedAddresses[uuid][unitId][params.registerType] = usedAddresses
        })

        // Send to backend with littleEndian from global state
        await window.api.addReplaceServerRegister({
          uuid,
          unitId,
          params,
          littleEndian
        })
      },
      removeRegister: (removeParams) => {
        const { uuid, unitId, registerType, address } = removeParams
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
          }
          delete state.serverRegisters[uuid][unitId][registerType][address]
          // Update used addresses after deletion
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid][unitId][registerType]).map((r) => r.params)
          )
          if (!state.usedAddresses[uuid]) state.usedAddresses[uuid] = {}
          if (!state.usedAddresses[uuid][unitId]) state.usedAddresses[uuid][unitId] = {}
          state.usedAddresses[uuid][unitId][registerType] = usedAddresses
        })
        window.api.removeServerRegister(removeParams)
      },
      setRegisterValue: (params) => {
        if (!Array.isArray(params)) params = [params]
        set((state) => {
          for (const p of params) {
            const { registerType, address, value, optionalUuid, optionalUnitId } = p
            const uuid = optionalUuid ?? get().selectedUuid
            const unitId = optionalUnitId ?? get().getUnitId(uuid)

            if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
            if (!state.serverRegisters[uuid][unitId]) {
              state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
            }

            // The address is the one level that can be gone by now. These
            // arrive batched on a 50 ms timer, and the event that proved the
            // entry existed fired before it, so a `removeRegister` or a
            // `resetRegisters` in between lands the flush on nothing.
            //
            // Dropped rather than recreated, which is what `setBool` does with
            // its own: a bool entry is a value, and a register entry carries
            // the params that say what it is. There is nothing here to build
            // one from.
            const entry = state.serverRegisters[uuid][unitId][registerType][address]
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
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = getDefaultServerRegisters()
          }
          if (!state.usedAddresses[uuid]) state.usedAddresses[uuid] = {}
          if (!state.usedAddresses[uuid][unitId]) {
            state.usedAddresses[uuid][unitId] = getDefaultUsedAddresses()
          }
          state.serverRegisters[uuid][unitId][registerType] = {}
          state.usedAddresses[uuid][unitId][registerType] = []
        })
      },
      setPort: async (port) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return

        const { port: currentPorts, selectedUuid } = get()

        get().cleanOrphanedServerState()

        // Port cannot be already used for another server
        const portAlreadyExists = Object.values(currentPorts).includes(port)
        const portIsMyPort = port === currentPorts[selectedUuid]
        if (portAlreadyExists && !portIsMyPort) return
        if (portIsMyPort) return

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

        const serverRegisters = currentState.serverRegisters[uuid]
        if (!serverRegisters) return

        const unitIdsWithData = extractUnitIdsWithData(serverRegisters)

        for (const unitId of unitIdsWithData) {
          await syncRegistersWithBackend(serverRegisters, unitId, uuid, littleEndian)
        }
      },
      replaceServerRegisters: (unitId, registers) => {
        const uuid = get().selectedUuid
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          state.serverRegisters[uuid][unitId] = registers
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
          if (!state.serialConfig) state.serialConfig = { ...defaultSerialConfig }
          state.serialConfig.com = com
        })
        // State-only — applied on blur via applyServerCom
      },
      applyServerCom: async () => {
        const currentState = get()
        if (currentState.serverMode !== 'rtu') return
        const serialConfig = currentState.serialConfig ?? defaultSerialConfig
        await window.api.stopRtuServer()
        if (serialConfig.com.trim()) {
          await window.api.startRtuServer({ uuid: MAIN_SERVER_UUID, serialConfig })
        }
      },
      setServerBaudRate: (baudRate: ModbusBaudRate) => {
        set((state) => {
          if (!state.serialConfig) state.serialConfig = { ...defaultSerialConfig }
          state.serialConfig.options.baudRate = baudRate
        })
        restartRtuIfActive(get)
      },
      setServerParity: (parity) => {
        set((state) => {
          if (!state.serialConfig) state.serialConfig = { ...defaultSerialConfig }
          state.serialConfig.options.parity = parity
        })
        restartRtuIfActive(get)
      },
      setServerDataBits: (dataBits) => {
        set((state) => {
          if (!state.serialConfig) state.serialConfig = { ...defaultSerialConfig }
          state.serialConfig.options.dataBits = dataBits
        })
        restartRtuIfActive(get)
      },
      setServerStopBits: (stopBits) => {
        set((state) => {
          if (!state.serialConfig) state.serialConfig = { ...defaultSerialConfig }
          state.serialConfig.options.stopBits = stopBits
        })
        restartRtuIfActive(get)
      },
      refreshServerSerialPorts: async () => {
        set((state) => {
          state.serverSerialPortsLoading = true
        })
        try {
          const ports = await window.api.listSerialPorts()
          set((state) => {
            state.serverSerialPorts = ports
          })
        } finally {
          set((state) => {
            state.serverSerialPortsLoading = false
          })
        }
      },
      getUnitId: (uuid: string): UnitIdString => {
        const state = get()
        let unitId = state.unitId[uuid]
        if (unitId === undefined) {
          set((state) => {
            state.unitId[uuid] = '0'
          })
          unitId = '0'
        }
        return unitId as UnitIdString
      }
    })),
    {
      name: SERVER_ZUSTAND_STORAGE_KEY,
      version: CURRENT_SERVER_ZUSTAND_VERSION,
      migrate: (persistedState, version) => {
        persistedVersion = version
        let state = persistedState as Record<string, unknown>

        // Version 0/1 (old format with littleEndian per register)
        if (version < 2) {
          state = migrateServerRegistersState(state)
        }

        // v2→v3: add serverMode and serialConfig
        if (version < 3) {
          state = migrateServerModeState(state)
          // Also convert old boolean shape if needed
          migrateBoolShape(
            (state as Record<string, unknown>).serverRegisters as
              | Record<string, Record<string, unknown> | undefined>
              | undefined
          )
        }

        // v3→v4: the RTU parity the serial binding refuses
        if (version < 4) {
          repairPersistedParity(state, 'serialConfig', 'options')
        }

        // v4→v5: registers at an address outside the 16 bit map
        if (version < 5) {
          dropUnservableRegisters(state)
        }

        return state as PersistedServerZustand
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

/**
 * Keep the fields that parsed and default the rest, then say which went.
 *
 * Module scope, so it cannot report through notistack: see the same block in
 * client.zustand.ts for why. MessageReceiver tells the user once it is mounted.
 */
const serverZustand = useServerZustand.getState()

const repair = repairPersisted(
  PersistedServerZustandSchema,
  serverZustand,
  useServerZustand.getInitialState(),
  persistedVersion !== undefined && persistedVersion > CURRENT_SERVER_ZUSTAND_VERSION
)

if (repair.reset !== undefined) {
  console.warn('server config repaired', repair.reset)
  keepCorrupt(localStorage, SERVER_ZUSTAND_STORAGE_KEY)
  useServerZustand.setState({ ...repair.state, configReset: repair.reset })
}

// Init server
useServerZustand.getState().init()

// Update register values in batches to avoid excessive re-renders
const pendingCompositeValues = new Map<string, number | bigint>()
const setRegisterParameterMap = new Map<string, SetRegisterValueParameters>()

const updateRegisterCountMax = 250
let updateRegisterCount = 0
let updateRegisterTimeout: NodeJS.Timeout

const delayedSetRegister = () => {
  clearTimeout(updateRegisterTimeout)

  const update = () => {
    serverZustand.setRegisterValue(Array.from(setRegisterParameterMap.values()))
    setRegisterParameterMap.clear()
    pendingCompositeValues.clear()
    updateRegisterCount = 0
  }

  if (updateRegisterCount++ > updateRegisterCountMax) {
    update()
    return
  }

  updateRegisterTimeout = setTimeout(update, 50)
}

// On raw register value result
onEvent('register_value', ({ uuid, unitId, registerType, address, raw: rawRegisterValue }) => {
  const serverZustand = useServerZustand.getState()

  // 1) Find the “base entry” in state.serverRegisters[*][*][registerType]
  //    We look back up to 3 registers because the largest DataType (int64/double) uses 4 registers.
  let serverRegisterEntry: ServerRegisterEntry | undefined
  let entryAddress: number | undefined

  for (let cand = address; cand >= address - 3; cand--) {
    const maybe = serverZustand.serverRegisters[uuid]?.[unitId]?.[registerType]?.[cand]
    if (!maybe) continue
    // Found an entry at candidate index—this is our base
    serverRegisterEntry = maybe
    entryAddress = cand
    break
  }
  if (!serverRegisterEntry || entryAddress === undefined) {
    return
  }

  // Extract the parameters and current composite value (from cache when state isn't updated yet)
  const cacheKey = `${uuid}-${unitId}-${registerType}-${entryAddress}`
  const currentValue = pendingCompositeValues.get(cacheKey) ?? serverRegisterEntry.value
  const { dataType } = serverRegisterEntry.params
  // Get littleEndian from global server state
  const littleEndian = serverZustand.littleEndian[uuid] ?? false

  // Skip composite merging for types that don't use numeric compositing
  if (dataType === 'utf8') return // Strings: no composite value
  if (dataType === 'none') return // No data type, nothing to compose

  // 2) Calculate how many registers this DataType spans
  const registersCount = registerWidth(dataType)
  if (registersCount < 1 || registersCount > 4) return // Defensive: only support 1-4 registers

  // 3) Determine which register‐offset was written
  const offsetRegisters = address - entryAddress
  if (offsetRegisters < 0 || offsetRegisters >= registersCount) {
    // Out of range for this composite entry—ignore
    return
  }

  // 4) Serialize the current composite value into a byte buffer
  const byteLength = registersCount * 2
  if (byteLength > 8) return // Defensive: DataView only supports up to 8 bytes for 64-bit types
  const buffer = new ArrayBuffer(byteLength)
  const view = new DataView(buffer)

  // Defensive: Clamp offset to buffer size
  const byteOffset = offsetRegisters * 2
  if (byteOffset < 0 || byteOffset + 2 > byteLength) return

  // Defensive: Only write if currentValue is a valid number (or bigint for 64-bit)
  try {
    switch (dataType) {
      case 'int16':
        view.setInt16(0, Number(currentValue) || 0, littleEndian)
        break
      case 'uint16':
      case 'bitmap':
        view.setUint16(0, Number(currentValue) || 0, littleEndian)
        break
      case 'int32':
        view.setInt32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'uint32':
      case 'unix':
        view.setUint32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'float':
        view.setFloat32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'int64':
        view.setBigInt64(0, BigInt(currentValue) || 0n, littleEndian)
        break
      case 'uint64':
      case 'datetime':
        view.setBigUint64(0, BigInt(currentValue) || 0n, littleEndian)
        break
      case 'double':
        view.setFloat64(0, Number(currentValue) || 0, littleEndian)
        break
      default:
        return
    }
    // 5) Overwrite just the one 16-bit register that the client wrote
    view.setUint16(byteOffset, rawRegisterValue, littleEndian)
  } catch (e) {
    // Defensive: If any DataView error occurs, abort
    console.error('register_value DataView error', e, {
      dataType,
      currentValue,
      byteOffset,
      byteLength
    })
    return
  }

  // 6) Read back the full composite value from the buffer
  let newComposite: number | bigint = 0
  try {
    switch (dataType) {
      case 'int16':
        newComposite = view.getInt16(0, littleEndian)
        break
      case 'uint16':
      case 'bitmap':
        newComposite = view.getUint16(0, littleEndian)
        break
      case 'int32':
        newComposite = view.getInt32(0, littleEndian)
        break
      case 'uint32':
      case 'unix':
        newComposite = view.getUint32(0, littleEndian)
        break
      case 'float':
        newComposite = view.getFloat32(0, littleEndian)
        break
      case 'int64':
        newComposite = view.getBigInt64(0, littleEndian)
        break
      case 'uint64':
      case 'datetime':
        newComposite = view.getBigUint64(0, littleEndian)
        break
      case 'double':
        newComposite = view.getFloat64(0, littleEndian)
        break
      default:
        newComposite = 0
    }
  } catch (e) {
    console.error('register_value DataView read error', e, { dataType, byteLength })
    return
  }

  const value = round(Number(newComposite), ['float', 'double'].includes(dataType) ? 3 : 0)

  pendingCompositeValues.set(cacheKey, newComposite)

  setRegisterParameterMap.set(cacheKey, {
    registerType,
    address: entryAddress,
    value,
    optionalUuid: uuid,
    optionalUnitId: unitId
  })

  delayedSetRegister()
})

// Update boolean values in batches to avoid excessive re-renders
const setBooleanParameterSet = new Map<string, SetBoolParameters>()
const pendingBooleanValues = new Map<string, boolean>()

const updateBoolCountMax = 250
let updateBoolCount = 0
let updateBoolTimeout: NodeJS.Timeout

const delayedSetBool = () => {
  clearTimeout(updateBoolTimeout)

  const update = () => {
    serverZustand.setBool(Array.from(setBooleanParameterSet.values()))
    setBooleanParameterSet.clear()
    pendingBooleanValues.clear()
    updateBoolCount = 0
  }

  if (updateBoolCount++ > updateBoolCountMax) {
    update()
    return
  }

  updateBoolTimeout = setTimeout(update, 50)
}

onEvent('boolean_value', ({ uuid, unitId, registerType, address, value }) => {
  const serverZustand = useServerZustand.getState()
  const entry = serverZustand.serverRegisters[uuid]?.[unitId]?.[registerType]?.[address]
  if (entry === undefined) return

  const cacheKey = `${uuid}-${unitId}-${registerType}-${address}`
  const currentBool = pendingBooleanValues.get(cacheKey) ?? entry.value

  if (currentBool !== value) {
    pendingBooleanValues.set(cacheKey, value)

    setBooleanParameterSet.set(cacheKey, {
      registerType,
      address,
      boolState: value,
      optionalUuid: uuid,
      optionalUnitId: unitId
    })
    delayedSetBool()
  }
})

// RTU server status
onEvent('rtu_server_status', ({ active }) => {
  useServerZustand.setState({ rtuServerActive: active })
})
