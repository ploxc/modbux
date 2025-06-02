/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import {
  PersistedServerZustand,
  PersistedServerZustandSchema,
  ServerZustand
} from './server.zustant.types'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import { MAIN_SERVER_UUID, RegisterParams, SyncBoolsParameters } from '@shared'
import { onEvent } from '@renderer/events'

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

export const useServerZustand = create<
  ServerZustand,
  [['zustand/persist', PersistedServerZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, getState) => ({
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
          state.unitId[uuid] = ''
          state.serverRegisters[uuid] = {
            coils: {},
            discrete_inputs: {},
            input_registers: {},
            holding_registers: {}
          }
          state.usedAddresses[uuid] = {
            holding_registers: [],
            input_registers: []
          }
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
        const state = getState()

        // Synchorize settings
        for (const uuid of state.uuids) {
          const port = Number(state.port[uuid])

          await window.api.setServerPort({ uuid, port })

          const unitId = state.unitId[uuid] === '' ? undefined : Number(state.unitId)
          await window.api.setServerUnitId({ uuid, unitID: unitId || 0 })

          // Synchronize the boolean states with the server from persisted state
          const coils: boolean[] = Array(65535).fill(false)
          const discreteInputs: boolean[] = Array(65535).fill(false)

          Object.values(state.serverRegisters[uuid]['coils'] || {}).forEach(
            (value, address) => (coils[address] = value)
          )
          Object.values(state.serverRegisters[uuid]['discrete_inputs'] || {}).forEach(
            (value, address) => (discreteInputs[address] = value)
          )

          window.api.syncBools({
            uuid,
            coils: coils,
            discrete_inputs: discreteInputs
          })

          // Synchronize the value generators/registers with the server from persisted state
          const inputRegisterRegisterValues = Object.values(
            state.serverRegisters[uuid]['input_registers']
          ).map((r) => r.params)
          const holdingRegisterRegisterValues = Object.values(
            state.serverRegisters[uuid]['holding_registers']
          ).map((r) => r.params)

          window.api.syncServerRegister({
            uuid,
            registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues]
          })

          set((state) => {
            ;(state.port[uuid] = String(port)),
              (state.unitId[uuid] = unitId === undefined ? '' : String(unitId))
            state.usedAddresses[uuid]['input_registers'] = getUsedAddresses(
              inputRegisterRegisterValues
            )
            state.usedAddresses[uuid]['holding_registers'] = getUsedAddresses(
              holdingRegisterRegisterValues
            )
          })
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
          const uuid = getState().selectedUuid
          state.name[uuid] = name
        }),
      addBools: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          const uuid = getState().selectedUuid
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't define when already defined
            if (state.serverRegisters[uuid][registerType][i]) continue
            state.serverRegisters[uuid][registerType][i] = false
            window.api.setBool({ uuid, registerType, address: i, state: false })
          }
        }),
      removeBool: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          const uuid = getState().selectedUuid
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't remove when not existing
            if (state.serverRegisters[uuid][registerType][i] === undefined) continue
            delete state.serverRegisters[uuid][registerType][i]
            window.api.setBool({ uuid, registerType, address: i, state: false })
          }
        }),
      setBool: (registerType, address, boolState, optionalUuid) =>
        set((state) => {
          const uuid = optionalUuid || getState().selectedUuid
          state.serverRegisters[uuid][registerType][address] = boolState
          window.api.setBool({ uuid, registerType, address, state: boolState })
        }),
      resetBools: (registerType) =>
        set((state) => {
          const currentState = getState()
          const uuid = currentState.selectedUuid
          state.serverRegisters[uuid][registerType] = {}

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
            coils: currentCoils,
            discrete_inputs: currentDiscreteInputs,
            [registerType]: new Array(65535).fill(false)
          }

          window.api.syncBools(newBools)
        }),
      addRegister: (addParams) =>
        set((state) => {
          const currentState = getState()
          if (!currentState.ready) return

          const { uuid, params } = addParams
          const { registerType, address } = params

          state.serverRegisters[uuid][registerType][address] = { value: 0, params }
          window.api.addReplaceServerRegister(addParams)

          // Update used addresses
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid][registerType]).map((r) => r.params)
          )
          state.usedAddresses[uuid][registerType] = usedAddresses
        }),
      removeRegister: (removeParams) =>
        set((state) => {
          const currentState = getState()
          if (!currentState.ready) return
          const { uuid, registerType, address } = removeParams
          delete state.serverRegisters[uuid][registerType][address]
          window.api.removeServerRegister(removeParams)

          // Update used addresses
          const usedAddresses = getUsedAddresses(
            Object.values(state.serverRegisters[uuid][registerType]).map((r) => r.params)
          )
          state.usedAddresses[uuid][registerType] = usedAddresses
        }),
      setRegisterValue: (type, address, value, optionalUuid) =>
        set((state) => {
          const uuid = optionalUuid || getState().selectedUuid
          state.serverRegisters[uuid][type][address].value = value
        }),
      resetRegisters: (registerType) =>
        set((state) => {
          const uuid = getState().selectedUuid
          window.api.resetRegisters({ uuid, registerType })
          state.serverRegisters[uuid][registerType] = {}
          state.usedAddresses[uuid][registerType] = []
        }),
      setPort: (port, valid) =>
        set((state) => {
          const currentState = getState()
          const uuid = currentState.selectedUuid
          if (!currentState.ready) return

          // Port cannot be already used for a server
          const { port: currentPorts, selectedUuid } = getState()
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
          const currentState = getState()
          const uuid = currentState.selectedUuid
          if (!currentState.ready) return
          state.unitId[uuid] = unitId
          if (currentState.unitId[uuid] === unitId) return
          window.api.setServerUnitId({ uuid, unitID: unitId === '' ? 0 : Number(unitId) })
        }),
      replaceServerRegisters: (registers) =>
        set((state) => {
          const currentState = getState()
          const uuid = currentState.selectedUuid
          state.serverRegisters[uuid] = registers
          currentState.init()
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
onEvent('register_value', ({ uuid, registerType, address, value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid][registerType]?.[address]) {
    state.setRegisterValue(registerType, address, value, uuid)
  }
})

onEvent('boolean_value', ({ uuid, registerType, address, state: value }) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[uuid][registerType][address] === undefined) return

  const currentBool = state.serverRegisters[uuid][registerType][address]
  if (currentBool !== value) state.setBool(registerType, address, value, uuid)
})
