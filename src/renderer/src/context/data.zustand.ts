/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { DataZustand } from './data.zustand.types'
import { mutative } from 'zustand-mutative'
import { DateTime } from 'luxon'
import { useRootZustand } from './root.zustand'
import { onEvent } from '@renderer/events'

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
      }),
    // Address groups
    addressGroups: [],
    setAddressGroups: (groups) =>
      set((state) => {
        state.addressGroups = groups
      })
  }))
)

// Data read from the registers
onEvent('register_data', (registerData) => {
  const state = useDataZustand.getState()
  const rootState = useRootZustand.getState()
  rootState.clientState.scanningRegisters
    ? state.appendRegisterData(registerData)
    : state.setRegisterData(registerData)
  rootState.setLastSuccessfulTransactionMillis(DateTime.now().toMillis())
})

onEvent('address_groups', (addressGroups) => {
  const state = useDataZustand.getState()
  state.setAddressGroups(addressGroups)
})
