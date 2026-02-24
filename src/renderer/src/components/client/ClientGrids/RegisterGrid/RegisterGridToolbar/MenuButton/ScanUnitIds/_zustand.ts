/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { RegisterType } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface ScanUnitIdZustand {
  open: boolean
  setOpen: (open: boolean) => void
  address: number
  setAddress: MaskSetFn
  length: number
  setLength: MaskSetFn
  startUnitId: number
  setStartUnitId: MaskSetFn
  count: number
  setCount: MaskSetFn
  registerTypes: RegisterType[]
  setRegisterTypes: (types: RegisterType[]) => void
  timeout: number
  setTimeout: MaskSetFn
}

export const useScanUnitIdZustand = create<ScanUnitIdZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    open: false,
    setOpen: (open) =>
      set((state) => {
        state.open = open
      }),
    address: 0,
    setAddress: (address) =>
      set((state) => {
        state.address = Number(address)
      }),
    length: 2,
    setLength: (length) =>
      set((state) => {
        state.length = Number(length)
      }),
    startUnitId: 0,
    setStartUnitId: (startUnitId) =>
      set((state) => {
        state.startUnitId = Number(startUnitId)
      }),
    count: 10,
    setCount: (count) =>
      set((state) => {
        state.count = Number(count)
      }),
    registerTypes: ['holding_registers'],
    setRegisterTypes: (types) =>
      set((state) => {
        state.registerTypes = types
      }),
    timeout: 500,
    setTimeout: (timeout) =>
      set((state) => {
        state.timeout = Number(timeout)
      })
  }))
)
