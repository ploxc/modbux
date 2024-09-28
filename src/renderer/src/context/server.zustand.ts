import { create } from 'zustand'
import { ServerZustand } from './server.zustant.types'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import { IpcEvent, RegisterType } from '@shared'

export const useServerZustand = create<
  ServerZustand,
  [['zustand/persist', never], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, getState) => ({
      ready: false,
      init: async () => {
        const state = getState()

        // Synchronize the boolean states with the server from persisted state
        const coils: boolean[] = []
        const discreteInputs: boolean[] = []

        Object.values(state.serverRegisters[RegisterType.Coils]).forEach(
          (value, address) => (coils[address] = value)
        )
        Object.values(state.serverRegisters[RegisterType.DiscreteInputs]).forEach(
          (value, address) => (discreteInputs[address] = value)
        )

        window.api.syncBools({
          [RegisterType.Coils]: coils,
          [RegisterType.DiscreteInputs]: discreteInputs
        })

        // Synchronize the value generators/registers with the server from persisted state
        const inputRegisterRegisterValues = Object.values(
          state.serverRegisters[RegisterType.InputRegisters]
        ).map((r) => r.params)
        const holdingRegisterRegisterValues = Object.values(
          state.serverRegisters[RegisterType.HoldingRegisters]
        ).map((r) => r.params)

        window.api.syncServerregisters({
          registerValues: [...inputRegisterRegisterValues, ...holdingRegisterRegisterValues]
        })

        set((state) => {
          state.ready = true
        })
      },
      serverRegisters: {
        [RegisterType.Coils]: {},
        [RegisterType.DiscreteInputs]: {},
        [RegisterType.InputRegisters]: {},
        [RegisterType.HoldingRegisters]: {}
      },
      addBools: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't define when already defined
            if (state.serverRegisters[registerType][i]) continue
            state.serverRegisters[registerType][i] = false
            window.api.setBool({ registerType, address: i, state: false })
          }
        }),
      removeBool: (registerType, address) =>
        set((state) => {
          const baseAddress = address - (address % 8)
          for (let i = baseAddress; i < baseAddress + 8; i++) {
            // Don't remove when not existing
            if (state.serverRegisters[registerType][i] === undefined) continue
            delete state.serverRegisters[registerType][i]
            window.api.setBool({ registerType, address: i, state: false })
          }
        }),
      setBool: (registerType, address, boolState) =>
        set((state) => {
          state.serverRegisters[registerType][address] = boolState
          window.api.setBool({ registerType, address, state: boolState })
        }),
      addRegister: (params) =>
        set((state) => {
          const currentState = getState()
          if (!currentState.ready) return
          state.serverRegisters[params.registerType][params.address] = { value: 0, params }
          window.api.addReplaceServerRegister(params)
        }),
      removeRegister: (params) =>
        set((state) => {
          const currentState = getState()
          if (!currentState.ready) return
          delete state.serverRegisters[params.registerType][params.address]
          window.api.removeServerRegister(params)
        }),
      setRegisterValue: (type, address, value) =>
        set((state) => {
          state.serverRegisters[type][address].value = value
        })
    })),
    { name: `server.zustand` }
  )
)

useServerZustand.getState().init()

// Listen to events
window.electron.ipcRenderer.on(IpcEvent.RegisterValue, (_, registerType, address, value) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[registerType]?.[address]) {
    state.setRegisterValue(registerType, address, value)
  }
})

window.electron.ipcRenderer.on(IpcEvent.BooleanValue, (_, registerType, address, value) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[registerType][address] === undefined) return

  const currentBool = state.serverRegisters[registerType][address]
  if (currentBool !== value) state.setBool(registerType, address, value)
})
