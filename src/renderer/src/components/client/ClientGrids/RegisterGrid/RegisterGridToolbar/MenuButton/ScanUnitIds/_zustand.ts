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
  range: [number, number]
  setMinRange: MaskSetFn
  setMaxRange: MaskSetFn
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
    range: [0, 10],
    setMinRange: (min) =>
      set((state) => {
        state.range[0] = Number(min)
      }),
    setMaxRange: (max) =>
      set((state) => {
        state.range[1] = Number(max)
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
