/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { BaseDataType } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface ValueInputZusand {
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
  value: string
  valid: boolean
  setValue: MaskSetFn
  address: number
  setAddress: (address: number) => void
  coilFunction: 5 | 15
  setCoilFunction: (coilFunction: 5 | 15) => void
  coils: boolean[]
  initCoils: (coils: boolean[]) => void
  setCoils: (coil: boolean, index: number) => void
}

export const useValueInputZustand = create<ValueInputZusand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    dataType: 'int16',
    setDataType: (dataType) =>
      set((state) => {
        state.dataType = dataType
      }),
    value: '0',
    valid: true,
    setValue: (value, valid) =>
      set((state) => {
        state.value = value
        state.valid = !!valid
      }),
    address: 0,
    setAddress: (address: number) =>
      set((state) => {
        state.address = address
      }),
    coilFunction: 5,
    setCoilFunction: (coilFunction: 5 | 15) =>
      set((state) => {
        state.coilFunction = coilFunction
      }),
    coils: [],
    initCoils: (coils) =>
      set((state) => {
        state.coils = coils
      }),
    setCoils: (coil, index) =>
      set((state) => {
        state.coils[index] = coil
      })
  }))
)
