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
  MAIN_SERVER_UUID,
  RegisterParams,
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
      createServer: async (params, setUuidAsSelected) => {
        await window.api.createServer(params)
        const { uuid, port } = params

        set((state) => {
          state.port[uuid] = String(port)
          state.portValid[uuid] = true
          state.unitId[uuid] = '0'
          state.serverRegisters[uuid] = {}
          state.usedAddresses[uuid] = {}

          UnitIdStringSchema.options.forEach((unitId) => {
            state.serverRegisters[uuid][unitId] = { ...defaultServerRegisters }
            state.usedAddresses[uuid][unitId] = { ...defaultUsedAddresses }
          })

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
              (value, address) => (coils[address][unitId] = value)
            )
            Object.values(state.serverRegisters[uuid]?.[unitId]?.['discrete_inputs'] || {}).forEach(
              (value, address) => (discreteInputs[address][unitId] = value)
            )

            window.api.syncBools({
              uuid,
              unitId,
              coils: coils,
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

// Listen to events
onEvent('register_value', ({ uuid, unitId, registerType, address, value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid]?.[unitId]?.[registerType]?.[address]) {
    state.setRegisterValue(registerType, address, value, uuid, unitId)
  }
})

onEvent('boolean_value', ({ uuid, unitId, registerType, address, value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid]?.[unitId]?.[registerType][address] === undefined) return

  const currentBool = state.serverRegisters[uuid][unitId][registerType][address]
  if (currentBool !== value) state.setBool(registerType, address, value, uuid, unitId)
})
