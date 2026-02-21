/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { DataZustand } from './data.zustand.types'
import { mutative } from 'zustand-mutative'
import { DateTime } from 'luxon'
import { useRootZustand } from './root.zustand'
import { onEvent } from '@renderer/events'
import { RegisterData, dummyWords } from '@shared'

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

/** Populate grid with configured register placeholders */
export const showMapping = (): void => {
  const registerData: RegisterData[] = []
  const registerMapping = useRootZustand.getState().registerMapping
  const type = useRootZustand.getState().registerConfig.type

  Object.entries(registerMapping[type]).forEach(([addressString, m]) => {
    if (!m || m.dataType === 'none' || !m.dataType) return
    const address = parseInt(addressString, 10)

    const row: RegisterData = {
      id: address,
      buffer: new Uint8Array([0, 0]),
      hex: '0000',
      words: { ...dummyWords },
      bit: false,
      isScanned: false
    }
    registerData.push(row)
  })

  useDataZustand.getState().setRegisterData(registerData)
}

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
