import { create } from 'zustand'
import { DataZustand } from './data.zustand.types'
import { mutative } from 'zustand-mutative'
import { IpcEvent, RegisterData } from '@shared'
import { DateTime } from 'luxon'
import { useRootZustand } from './root.zustand'

export const useDataZustand = create<DataZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    // Register data
    registerData: [],
    setRegisterData: (data) =>
      set((state) => {
        state.registerData = data
      }),
    appendRegisterData: (data) =>
      set((state) => {
        state.registerData.push(...data)
      })
  }))
)

// Data read from the registers
window.electron.ipcRenderer.on(IpcEvent.RegisterData, (_, registerData: RegisterData[]) => {
  const state = useDataZustand.getState()
  const rootState = useRootZustand.getState()
  rootState.clientState.scanningRegisters
    ? state.appendRegisterData(registerData)
    : state.setRegisterData(registerData)
  rootState.setLastSuccessfulTransactionMillis(DateTime.now().toMillis())
})
