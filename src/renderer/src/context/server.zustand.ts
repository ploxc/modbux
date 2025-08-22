/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import {
  PersistedServerZustand,
  PersistedServerZustandSchema,
  ServerZustand,
  UsedAddresses
} from './server.zustant.types'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import {
  DataType,
  MAIN_SERVER_UUID,
  RegisterParams,
  ServerRegisterEntry,
  ServerRegisters,
  SyncBoolsParameters,
  UnitIdString,
  UnitIdStringSchema
} from '@shared'
import { onEvent } from '@renderer/events'
import { round } from 'lodash'

const defaultServerRegisters: ServerRegisters = {
  coils: {},
  discrete_inputs: {},
  input_registers: {},
  holding_registers: {}
}

const defaultUsedAddresses: UsedAddresses = {
  input_registers: [],
  holding_registers: []
}

const getUsedAddresses = (registers: RegisterParams[]) => {
  const addressSet = new Set<number>()
  registers.forEach((p) => {
    if (['int16', 'uint16'].includes(p.dataType)) addressSet.add(p.address)
    if (['int32', 'uint32', 'float'].includes(p.dataType)) {
      addressSet.add(p.address)
      addressSet.add(p.address + 1)
    }

    if (['int64', 'uint64', 'double'].includes(p.dataType)) {
      addressSet.add(p.address)
      addressSet.add(p.address + 1)
      addressSet.add(p.address + 2)
      addressSet.add(p.address + 3)
    }
  })
  return Array.from(addressSet)
}

export const checkHasConfig = (reg: ServerRegisters | undefined): boolean => {
  const coils = reg?.coils ?? {}
  const hasCoils = Object.values(coils).some((v) => v)
  const discrete = reg?.discrete_inputs ?? {}
  const hasDiscrete = Object.values(discrete).some((v) => v)
  const hasInput = Object.values(reg?.input_registers ?? []).length > 0
  const hasHolding = Object.values(reg?.holding_registers ?? []).length > 0
  return hasCoils || hasDiscrete || hasInput || hasHolding
}

export const useServerZustand = create<
  ServerZustand,
  [['zustand/persist', PersistedServerZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      ready: { [MAIN_SERVER_UUID]: false },
      selectedUuid: MAIN_SERVER_UUID,
      uuids: [],
      port: {},
      portValid: {},
      unitId: {},
      serverRegisters: {},
      usedAddresses: {},
      name: {},
      clean: (uuid) =>
        set((state) => {
          state.unitId[uuid] = '0'
          state.serverRegisters[uuid] = {}
          state.usedAddresses[uuid] = {}
          for (const unitId of UnitIdStringSchema.options) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
            state.usedAddresses[uuid][unitId] = { ...defaultUsedAddresses }
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
              delete state.portValid[uuid]
              delete state.unitId[uuid]
              delete state.serverRegisters[uuid]
              delete state.usedAddresses[uuid]
              delete state.name[uuid]
            }
          })
        })
      },
      createServer: async (params) => {
        // Only update port from backend response, never from input
        const actualPort = await window.api.createServer(params)
        const { uuid, port } = params

        console.log({ port, uuid, actualPort })

        set((state) => {
          state.port[uuid] = String(actualPort)
          state.portValid[uuid] = true
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
          if (state.selectedUuid === uuid) state.selectedUuid = state.uuids[0]
          delete state.port[uuid]
          delete state.portValid[uuid]
          delete state.unitId[uuid]
          delete state.serverRegisters[uuid]
          delete state.usedAddresses[uuid]
        })
        get().cleanOrphanedServerState()
      },
      init: async (uuid) => {
        set((state) => {
          if (uuid) state.ready[uuid] = false
          else for (const u of state.uuids) state.ready[u] = false
        })
        const state = get()

        // Ensure every uuid has a unitId entry (for backward compatibility)
        set((state) => {
          for (const uuid of state.uuids) {
            if (state.unitId[uuid] === undefined) {
              state.unitId[uuid] = '0'
            }
          }
        })

        // Determine which uuid should be initialized when provided
        const uuidsToSync = uuid ? [uuid] : state.uuids

        for (const syncUuid of uuidsToSync) {
          const port = Number(state.port[syncUuid])
          const actualPort = await window.api.setServerPort({ uuid: syncUuid, port })

          set((state) => {
            state.port[syncUuid] = String(actualPort)
          })

          const serverRegister = state.serverRegisters[syncUuid]
          if (!serverRegister) continue
          const unitIds = Object.keys(serverRegister) as UnitIdString[]
          const unitIdsWithData = unitIds.filter((unitId) => {
            const reg = serverRegister[unitId]
            return checkHasConfig(reg)
          })

          for (const unitId of unitIdsWithData) {
            // Synchronize the boolean states with the server from persisted state
            const coils: boolean[] = Array(65535).fill(false)
            const discreteInputs: boolean[] = Array(65535).fill(false)

            Object.values(serverRegister[unitId]?.['coils'] ?? {}).forEach(
              (value, address) => (coils[address] = value)
            )
            Object.values(serverRegister[unitId]?.['discrete_inputs'] ?? {}).forEach(
              (value, address) => (discreteInputs[address] = value)
            )

            await window.api.syncBools({
              uuid: syncUuid,
              unitId,
              coils,
              discrete_inputs: discreteInputs
            })

            // Synchronize the value generators/registers with the server from persisted state
            const inputRegisterRegisterValues = Object.values(
              serverRegister[unitId]?.['input_registers'] ?? []
            ).map((r) => r.params)
            const holdingRegisterRegisterValues = Object.values(
              serverRegister[unitId]?.['holding_registers'] ?? []
            ).map((r) => r.params)

            await window.api.syncServerRegister({
              uuid: syncUuid,
              unitId,
              registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues]
            })

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
          })
        }

        if (state.uuids.length === 0) {
          // Create the main server if no server exists in persisted state
          state.createServer({ port: 502, uuid: MAIN_SERVER_UUID })
          set((state) => {
            state.ready[MAIN_SERVER_UUID] = true
          })
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
      addBools: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const baseAddress = address - (address % 8)
        set((state) => {
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't define when already defined
            if (state.serverRegisters[uuid]?.[unitId]?.[registerType][i]) continue
            if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
            if (!state.serverRegisters[uuid][unitId]) {
              state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
            }
            state.serverRegisters[uuid][unitId][registerType][i] = false
            window.api.setBool({ uuid, unitId, registerType, address: i, state: false })
          }
        })
      },
      removeBool: (registerType, address) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const baseAddress = address - (address % 8)
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't remove when not existing
            if (state.serverRegisters[uuid][unitId][registerType][i] === undefined) continue
            delete state.serverRegisters[uuid][unitId][registerType][i]
            window.api.setBool({ uuid, unitId, registerType, address: i, state: false })
          }
        })
      },
      setBool: (registerType, address, boolState, optionalUuid, optionalUnitId) => {
        const uuid = optionalUuid ?? get().selectedUuid
        const unitId = optionalUnitId ?? get().getUnitId(uuid)
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][registerType][address] = boolState
          window.api.setBool({ uuid, unitId, registerType, address, state: boolState })
        })
      },
      resetBools: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        const currentState = get()
        const currentCoils = new Array(65535).fill(false)
        const currentDiscreteInputs = new Array(65535).fill(false)
        Object.entries(currentState.serverRegisters.coils ?? {}).forEach(([k, v]) => {
          currentCoils[Number(k)] = v
        })
        Object.entries(currentState.serverRegisters['discrete_inputs'] ?? {}).forEach(([k, v]) => {
          currentDiscreteInputs[Number(k)] = v
        })
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][registerType] = {}
          const newBools: SyncBoolsParameters = {
            uuid,
            unitId,
            coils: currentCoils,
            discrete_inputs: currentDiscreteInputs,
            [registerType]: new Array(65535).fill(false)
          }
          window.api.syncBools(newBools)
        })
      },
      addRegister: (addParams) => {
        const { uuid, unitId, params } = addParams
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][params.registerType][params.address] = {
            value: 0,
            params
          }
          window.api.addReplaceServerRegister(addParams)
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
      },
      removeRegister: (removeParams) => {
        const { uuid, unitId, registerType, address } = removeParams
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
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
      setRegisterValue: (type, address, value, optionalUuid, optionalUnitId) => {
        const uuid = optionalUuid ?? get().selectedUuid
        const unitId = optionalUnitId ?? get().getUnitId(uuid)
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][type][address].value = value
        })
      },
      resetRegisters: (registerType) => {
        const uuid = get().selectedUuid
        const unitId = get().getUnitId(uuid)
        window.api.resetRegisters({ uuid, unitId, registerType })
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          if (!state.usedAddresses[uuid]) state.usedAddresses[uuid] = {}
          if (!state.usedAddresses[uuid][unitId]) {
            state.usedAddresses[uuid][unitId] = { ...defaultUsedAddresses }
          }
          state.serverRegisters[uuid][unitId][registerType] = {}
          state.usedAddresses[uuid][unitId][registerType] = []
        })
      },
      setPort: async (port, valid) => {
        const currentState = get()
        const uuid = currentState.selectedUuid
        if (!currentState.ready[uuid]) return

        const { port: currentPorts, selectedUuid } = get() // removed unused uuids

        get().cleanOrphanedServerState()

        // Port cannot be already used for a server
        const portAlreadyExists = Object.values(currentPorts).includes(port)
        const portIsMyPort = port === currentPorts[selectedUuid]

        console.log({ portAlreadyExists, portIsMyPort, port, selectedUuid, currentPorts })

        if (portIsMyPort) valid = true // If this is my port, it is always valid
        if (portAlreadyExists && !portIsMyPort) valid = false

        set((state) => {
          state.portValid[uuid] = !!valid
        })
        if (!valid) return

        // Only update port from backend response
        const actualPort = await window.api.setServerPort({ uuid, port: Number(port) })
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
      replaceServerRegisters: (unitId, registers) => {
        const uuid = get().selectedUuid
        set((state) => {
          if (!state.serverRegisters[uuid]) state.serverRegisters[uuid] = {}
          state.serverRegisters[uuid][unitId] = registers
        })
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
      name: `server.zustand`,
      partialize: (state) => ({
        name: state.name,
        port: state.port,
        portValid: state.portValid,
        selectedUuid: state.selectedUuid,
        serverRegisters: state.serverRegisters,
        unitId: state.unitId,
        usedAddresses: state.usedAddresses,
        uuids: state.uuids
      })
    }
  )
)

// Clear when state is corrupted
const clear = (): void => {
  useServerZustand.persist.clearStorage()
  useServerZustand.setState(useServerZustand.getInitialState())
}

const state = useServerZustand.getState()

const stateResult = PersistedServerZustandSchema.safeParse(state)
if (!stateResult.success) {
  console.warn(stateResult.error)
  clear()
}

// Init server
useServerZustand.getState().init()

// Get the address in use for a specific register type and data type
const getRegisterLength = (dataType: DataType): number => {
  switch (dataType) {
    case 'int16':
    case 'uint16':
      return 1
    case 'int32':
    case 'uint32':
    case 'float':
      return 2
    case 'int64':
    case 'uint64':
    case 'double':
      return 4
    default:
      return 0
  }
}

// On raw register value result
onEvent('register_value', ({ uuid, unitId, registerType, address, raw: rawRegisterValue }) => {
  const state = useServerZustand.getState()

  // 1) Find the “base entry” in state.serverRegisters[*][*][registerType]
  //    We look back up to 3 registers because the largest DataType (int64/double) uses 4 registers.
  let serverRegisterEntry: ServerRegisterEntry | undefined
  let entryAddress: number | undefined

  for (let cand = address; cand >= address - 3; cand--) {
    const maybe = state.serverRegisters[uuid]?.[unitId]?.[registerType]?.[cand]
    if (!maybe) continue
    // Found an entry at candidate index—this is our base
    serverRegisterEntry = maybe
    entryAddress = cand
    break
  }
  if (!serverRegisterEntry || entryAddress === undefined) {
    return
  }

  // Extract the parameters and current composite value
  const { params, value: currentValue } = serverRegisterEntry
  const { dataType, littleEndian } = params

  // 2) Calculate how many registers this DataType spans
  const registersCount = getRegisterLength(dataType)
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
        view.setUint16(0, Number(currentValue) || 0, littleEndian)
        break
      case 'int32':
        view.setInt32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'uint32':
        view.setUint32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'float':
        view.setFloat32(0, Number(currentValue) || 0, littleEndian)
        break
      case 'int64':
        view.setBigInt64(0, BigInt(currentValue) || 0n, littleEndian)
        break
      case 'uint64':
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
        newComposite = view.getUint16(0, littleEndian)
        break
      case 'int32':
        newComposite = view.getInt32(0, littleEndian)
        break
      case 'uint32':
        newComposite = view.getUint32(0, littleEndian)
        break
      case 'float':
        newComposite = view.getFloat32(0, littleEndian)
        break
      case 'int64':
        newComposite = view.getBigInt64(0, littleEndian)
        break
      case 'uint64':
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
  state.setRegisterValue(registerType, entryAddress, value, uuid, unitId)
})

onEvent('boolean_value', ({ uuid, unitId, registerType, address, value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid]?.[unitId]?.[registerType][address] === undefined) return

  const currentBool = state.serverRegisters[uuid][unitId][registerType][address]
  if (currentBool !== value) state.setBool(registerType, address, value, uuid, unitId)
})
