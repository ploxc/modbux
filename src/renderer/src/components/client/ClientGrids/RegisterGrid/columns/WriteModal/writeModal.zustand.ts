/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/client.zustand.types'
import { BaseDataType, BaseDataTypeSchema, RegisterData } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

/** What the dialog writes with when the address does not name a type. */
export const DEFAULT_WRITE_DATA_TYPE: BaseDataType = 'int16'

/**
 * The data type the dialog opens with for an address.
 *
 * This store outlives the dialog, so an address the mapping says nothing about
 * would otherwise be written with whatever the address before it used. `none`
 * is a mapping without a type rather than a type to write with.
 */
export const writeDataTypeFor = (mapped: unknown): BaseDataType => {
  const result = BaseDataTypeSchema.safeParse(mapped)
  if (!result.success || result.data === 'none') return DEFAULT_WRITE_DATA_TYPE
  return result.data
}

/**
 * The coil list the write dialog starts from: what the grid holds for the
 * range, and false for an address it has no row for.
 *
 * FC15 sends every coil from the opened address to the end of the range, so a
 * list that starts out all false writes false over every coil the user did not
 * touch. The rows are what the device answered on the last read, so they are
 * what goes back out.
 */
export const seedCoils = (
  registerData: RegisterData[],
  firstAddress: number,
  length: number
): boolean[] => {
  const coils: boolean[] = Array(length).fill(false)

  registerData.forEach((row) => {
    const index = row.id - firstAddress
    if (index >= 0 && index < length) coils[index] = row.bit
  })

  return coils
}

interface ValueInputZustand {
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
  value: string
  valid: boolean
  setValue: MaskSetFn
  resetValue: () => void
  address: number
  setAddress: (address: number) => void
  coilFunction: 5 | 15
  setCoilFunction: (coilFunction: 5 | 15) => void
  coils: boolean[]
  initCoils: (coils: boolean[]) => void
  setCoils: (coil: boolean, index: number) => void
}

export const useValueInputZustand = create<ValueInputZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    dataType: DEFAULT_WRITE_DATA_TYPE,
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
    // The dialog closes on a value nobody typed, so it closes on a valid one.
    // `setValue` reads its second argument as the verdict, and a reset that
    // leaves it out marks a plain 0 as invalid for the next address opened.
    resetValue: () =>
      set((state) => {
        state.value = '0'
        state.valid = true
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
