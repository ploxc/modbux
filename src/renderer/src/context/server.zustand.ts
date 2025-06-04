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
  getRegisterLength,
  MAIN_SERVER_UUID,
  RegisterParams,
  ServerRegisterEntry,
  ServerRegisters,
  SyncBoolsParameters,
  UnitIdString,
  UnitIdStringSchema
} from '@shared'
import { onEvent } from '@renderer/events'

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
  const coils = reg?.coils || {}
  const hasCoils = Object.values(coils).some((v) => v)
  const discrete = reg?.discrete_inputs || {}
  const hasDiscrete = Object.values(discrete).some((v) => v)
  const hasInput = Object.values(reg?.input_registers || []).length > 0
  const hasHolding = Object.values(reg?.holding_registers || []).length > 0
  return hasCoils || hasDiscrete || hasInput || hasHolding
}

export const useServerZustand = create<
  ServerZustand,
  [['zustand/persist', PersistedServerZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      ready: false,
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
          UnitIdStringSchema.options.forEach((unitId) => {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
            state.usedAddresses[uuid][unitId] = { ...defaultUsedAddresses }
          })
        }),
      createServer: async (params, setUuidAsSelected) => {
        await window.api.createServer(params)
        const { uuid, port } = params

        set((state) => {
          state.port[uuid] = String(port)
          state.portValid[uuid] = true
          get().clean(uuid)

          state.uuids.push(uuid)
          if (setUuidAsSelected) state.selectedUuid = uuid
        })
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
      },
      init: async () => {
        set((state) => {
          state.ready = false
        })
        const state = get()

        // Synchorize settings
        for (const uuid of state.uuids) {
          const port = Number(state.port[uuid])
          await window.api.setServerPort({ uuid, port })

          const unitIds = Object.keys(state.serverRegisters[uuid]) as UnitIdString[]
          const unitIdsWithData = unitIds.filter((unitId) => {
            const reg = state.serverRegisters[uuid][unitId]
            return checkHasConfig(reg)
          })

          for (const unitId of unitIdsWithData) {
            // Synchronize the boolean states with the server from persisted state
            const coils: boolean[] = Array(65535).fill(false)
            const discreteInputs: boolean[] = Array(65535).fill(false)

            Object.values(state.serverRegisters[uuid]?.[unitId]?.['coils'] || {}).forEach(
              (value, address) => (coils[address] = value)
            )
            Object.values(state.serverRegisters[uuid]?.[unitId]?.['discrete_inputs'] || {}).forEach(
              (value, address) => (discreteInputs[address] = value)
            )

            window.api.syncBools({
              uuid,
              unitId,
              coils,
              discrete_inputs: discreteInputs
            })

            // Synchronize the value generators/registers with the server from persisted state
            const inputRegisterRegisterValues = Object.values(
              state.serverRegisters[uuid]?.[unitId]?.['input_registers'] || []
            ).map((r) => r.params)
            const holdingRegisterRegisterValues = Object.values(
              state.serverRegisters[uuid]?.[unitId]?.['holding_registers'] || []
            ).map((r) => r.params)

            window.api.syncServerRegister({
              uuid,
              unitId,
              registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues]
            })

            const inputUsedAddresses = getUsedAddresses(inputRegisterRegisterValues)
            const holdingUsedAddresses = getUsedAddresses(holdingRegisterRegisterValues)

            set((state) => {
              if (!state.usedAddresses[uuid][unitId]) state.usedAddresses[uuid][unitId] = {}
              state.usedAddresses[uuid][unitId]['input_registers'] = inputUsedAddresses
              state.usedAddresses[uuid][unitId]['holding_registers'] = holdingUsedAddresses
            })
          }

          // ! I think this is redundant
          // set((state) => {
          //   state.port[uuid] = String(port)
          //   state.unitId[uuid] = state.unitId[uuid]
          // })
        }

        if (state.uuids.length === 0) {
          // Create the main server if no server exists in persisted state
          state.createServer({ port: 502, uuid: MAIN_SERVER_UUID })
        }

        set((state) => {
          state.ready = true
        })
      },
      setSelectedUuid: (uuid) =>
        set((state) => {
          state.selectedUuid = uuid
        }),
      setName: (name) =>
        set((state) => {
          const uuid = get().selectedUuid
          state.name[uuid] = name
        }),
      addBools: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          const uuid = get().selectedUuid
          const unitId = get().unitId[uuid]

          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't define when already defined
            if (state.serverRegisters[uuid]?.[unitId]?.[registerType][i]) continue
            if (!state.serverRegisters[uuid][unitId]) {
              state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
            }
            state.serverRegisters[uuid][unitId][registerType][i] = false
            window.api.setBool({ uuid, unitId, registerType, address: i, state: false })
          }
        }),
      removeBool: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          const uuid = get().selectedUuid
          const unitId = get().unitId[uuid]

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }

          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't remove when not existing
            if (state.serverRegisters[uuid][unitId][registerType][i] === undefined) continue
            delete state.serverRegisters[uuid][unitId][registerType][i]
            window.api.setBool({ uuid, unitId, registerType, address: i, state: false })
          }
        }),
      setBool: (registerType, address, boolState, optionalUuid, optionalUnitId) =>
        set((state) => {
          const uuid = optionalUuid || get().selectedUuid
          const unitId = optionalUnitId || get().unitId[uuid]

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }

          state.serverRegisters[uuid][unitId][registerType][address] = boolState
          window.api.setBool({ uuid, unitId, registerType, address, state: boolState })
        }),
      resetBools: (registerType) =>
        set((state) => {
          const currentState = get()
          const uuid = currentState.selectedUuid
          const unitId = get().unitId[uuid]

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][registerType] = {}

          const currentCoils = new Array(65535).fill(false)
          const currentDiscreteInputs = new Array(65535).fill(false)

          Object.entries(currentState.serverRegisters.coils || {}).forEach(([k, v]) => {
            currentCoils[Number(k)] = v
          })
          Object.entries(currentState.serverRegisters['discrete_inputs'] || {}).forEach(
            ([k, v]) => {
              currentDiscreteInputs[Number(k)] = v
            }
          )

          const newBools: SyncBoolsParameters = {
            uuid,
            unitId,
            coils: currentCoils,
            discrete_inputs: currentDiscreteInputs,
            [registerType]: new Array(65535).fill(false)
          }

          window.api.syncBools(newBools)
        }),
      addRegister: (addParams) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          const { uuid, unitId, params } = addParams
          const { registerType, address } = params

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          state.serverRegisters[uuid][unitId][registerType][address] = { value: 0, params }
          window.api.addReplaceServerRegister(addParams)

          // Update used addresses
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid][unitId][registerType]).map((r) => r.params)
          )
          if (!state.usedAddresses[uuid][unitId]) state.usedAddresses[uuid][unitId] = {}
          state.usedAddresses[uuid][unitId][registerType] = usedAddresses
        }),
      removeRegister: (removeParams) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          const { uuid, unitId, registerType, address } = removeParams
          delete state.serverRegisters[uuid]?.[unitId]?.[registerType][address]
          window.api.removeServerRegister(removeParams)

          // Update used addresses
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid]?.[unitId]?.[registerType] || []).map(
              (r) => r.params
            )
          )
          if (!state.usedAddresses[uuid][unitId]) state.usedAddresses[uuid][unitId] = {}
          state.usedAddresses[uuid][unitId][registerType] = usedAddresses
        }),
      setRegisterValue: (type, address, value, optionalUuid, optionalUnitId) =>
        set((state) => {
          const uuid = optionalUuid || get().selectedUuid
          const unitId = optionalUnitId || get().unitId[uuid]

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }

          state.serverRegisters[uuid][unitId][type][address].value = value
        }),
      resetRegisters: (registerType) =>
        set((state) => {
          const uuid = get().selectedUuid
          const unitId = get().unitId[uuid]

          window.api.resetRegisters({ uuid, unitId, registerType })

          if (!state.serverRegisters[uuid][unitId]) {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
          }
          if (!state.usedAddresses[uuid][unitId]) {
            state.usedAddresses[uuid][unitId] = { ...defaultUsedAddresses }
          }

          state.serverRegisters[uuid][unitId][registerType] = {}
          state.usedAddresses[uuid][unitId][registerType] = []
        }),
      setPort: (port, valid) =>
        set((state) => {
          const currentState = get()
          const uuid = currentState.selectedUuid
          if (!currentState.ready) return

          // Port cannot be already used for a server
          const { port: currentPorts, selectedUuid } = get()
          const portAlreadyExists = Object.values(currentPorts).includes(port)
          const portIsMyPort = port === currentPorts[selectedUuid]

          if (portAlreadyExists && !portIsMyPort) valid = false

          state.portValid[uuid] = !!valid
          state.port[uuid] = port

          if (!valid || currentState.port[uuid] === port) return
          window.api.setServerPort({ uuid, port: Number(port) })
        }),
      setUnitId: (unitId) =>
        set((state) => {
          const currentState = get()
          const uuid = currentState.selectedUuid
          if (!currentState.ready) return
          state.unitId[uuid] = unitId
        }),
      replaceServerRegisters: (unitId, registers) =>
        set((state) => {
          const uuid = get().selectedUuid
          state.serverRegisters[uuid][unitId] = registers
          get().init()
        })
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
  console.log(stateResult.error)
  clear()
}

// Init server
useServerZustand.getState().init()

// On raw register value result
onEvent('register_value', ({ uuid, unitId, registerType, address, raw: rawRegisterValue }) => {
  const state = useServerZustand.getState()

  // 1) Find the “base entry” in state.serverRegisters[*][*][registerType]
  //    We look back up to 3 registers because the largest DataType (int64/double) uses 4 registers.
  //    If a composite value started at register 104 (e.g. a 32-bit value occupies 104 and 105),
  //    and the client just wrote to 105, we need to find that base index (104).
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

  // 3) Determine which register‐offset was written
  //    e.g. if dataType = 'int32' (2 registers) and entryAddress = 104,
  //    and the client wrote at address = 105, then offsetRegisters = 1.
  const offsetRegisters = address - entryAddress
  if (offsetRegisters < 0 || offsetRegisters >= registersCount) {
    // Out of range for this composite entry—ignore
    return
  }

  // 4) Serialize the current composite value into a byte buffer
  //    We create a buffer of (registersCount * 2) bytes, then pack the currentValue.
  const byteLength = registersCount * 2
  const buffer = new ArrayBuffer(byteLength)
  const view = new DataView(buffer)

  switch (dataType) {
    case 'int16':
      view.setInt16(0, currentValue as number, littleEndian)
      break
    case 'uint16':
      view.setUint16(0, currentValue as number, littleEndian)
      break
    case 'int32':
      view.setInt32(0, currentValue as number, littleEndian)
      break
    case 'uint32':
      view.setUint32(0, currentValue as number, littleEndian)
      break
    case 'float':
      view.setFloat32(0, currentValue as number, littleEndian)
      break
    case 'int64':
      view.setBigInt64(0, BigInt(currentValue as number), littleEndian)
      break
    case 'uint64':
      view.setBigUint64(0, BigInt(currentValue as number), littleEndian)
      break
    case 'double':
      view.setFloat64(0, currentValue as number, littleEndian)
      break
    default:
      return
  }

  // 5) Overwrite just the one 16-bit register that the client wrote
  //    Calculate the byte offset: each register is 2 bytes, so offsetRegisters * 2.
  const byteOffset = offsetRegisters * 2
  //    Use setUint16 to write the new 16-bit word into the right position,
  //    and pass `littleEndian` so that the word itself is stored in the correct byte order.
  view.setUint16(byteOffset, rawRegisterValue, littleEndian)

  // 6) Read back the full composite value from the buffer
  let newComposite: number
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
      newComposite = Number(view.getBigInt64(0, littleEndian))
      break
    case 'uint64':
      newComposite = Number(view.getBigUint64(0, littleEndian))
      break
    case 'double':
      newComposite = view.getFloat64(0, littleEndian)
      break
    default:
      newComposite = 0
  }

  // 7) Store the recombined value back into state.serverRegisters at the base address.
  //    We do NOT store rawRegisterValue here—the entry.value should always be the full composite.
  state.setRegisterValue(registerType, entryAddress, newComposite, uuid, unitId)
})

onEvent('boolean_value', ({ uuid, unitId, registerType, address, value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid]?.[unitId]?.[registerType][address] === undefined) return

  const currentBool = state.serverRegisters[uuid][unitId][registerType][address]
  if (currentBool !== value) state.setBool(registerType, address, value, uuid, unitId)
})
