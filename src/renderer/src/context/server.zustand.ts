import { create } from 'zustand'
import { ServerZustand } from './server.zustant.types'
import { mutative } from 'zustand-mutative'
import { DataType, IpcEvent, RegisterType } from '@shared'

export const useServerZustand = create<ServerZustand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    ready: false,
    init: async () => {
      const valueGeneratorParams = await window.api.getValueGeneratorParams()

      const inputRegisterParams = valueGeneratorParams[RegisterType.InputRegisters]
      inputRegisterParams.sort((a, b) => a[0] - b[0])

      const holdingRegisterParams = valueGeneratorParams[RegisterType.HoldingRegisters]
      holdingRegisterParams.sort((a, b) => a[0] - b[0])

      set((state) => {
        inputRegisterParams.forEach(([address, params]) => {
          state.serverRegisters[RegisterType.InputRegisters][address] = { value: 0, params }
        })
        holdingRegisterParams.forEach(([address, params]) => {
          state.serverRegisters[RegisterType.HoldingRegisters][address] = { value: 0, params }
        })
        state.serverRegisters[RegisterType.InputRegisters]
        state.ready = true
      })
    },
    serverRegisters: {
      [RegisterType.Coils]: {},
      [RegisterType.DiscreteInputs]: {},
      [RegisterType.InputRegisters]: {},
      [RegisterType.HoldingRegisters]: {}
    },
    addBool: (type, address) =>
      set((state) => {
        state.serverRegisters[type][address] = false
      }),
    removeBool: (registerType, address) =>
      set((state) => {
        delete state.serverRegisters[registerType][address]
        window.api.setBool({ registerType, address, state: false })
      }),
    setBool: (type, address, boolState) =>
      set((state) => {
        state.serverRegisters[type][address] = boolState
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
  }))
)

useServerZustand
  .getState()
  .init()
  .then(() => {
    // ! TEST
    console.log('adding value generator')
    useServerZustand.getState().addRegister({
      address: 0,
      registerType: RegisterType.HoldingRegisters,
      dataType: DataType.UInt16,
      min: 10,
      max: 50000,
      interval: 1000,
      littleEndian: false
    })
  })

// Listen to events
window.electron.ipcRenderer.on(IpcEvent.ValueGeneratorValue, (_, registerType, address, value) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[registerType]?.[address]) {
    state.setRegisterValue(registerType, address, value)
  }
})

window.electron.ipcRenderer.on(IpcEvent.BooleanValue, (_, registerType, address, value) => {
  const state = useServerZustand.getState()
  if (state.serverRegisters[registerType]?.[address]) {
    state.setBool(registerType, address, value)
  }
})
