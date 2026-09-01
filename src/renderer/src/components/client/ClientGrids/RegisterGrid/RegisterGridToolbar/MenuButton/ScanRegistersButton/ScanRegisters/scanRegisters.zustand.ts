/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface ScanRegistersZustand {
  open: boolean
  setOpen: (open: boolean) => void
  address: number
  setAddress: MaskSetFn
  scanLength: number
  setScanLength: MaskSetFn
  chunkSize: number
  setChunkSize: MaskSetFn
  timeout: number
  setTimeout: MaskSetFn
}
export const useScanRegistersZustand = create<ScanRegistersZustand, [['zustand/mutative', never]]>(
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
    scanLength: 10000,
    setScanLength: (scanLength) =>
      set((state) => {
        state.scanLength = Number(scanLength)
      }),
    chunkSize: 100,
    setChunkSize: (chunkSize) =>
      set((state) => {
        state.chunkSize = Number(chunkSize)
      }),
    timeout: 500,
    setTimeout: (timeout) =>
      set((state) => {
        state.timeout = Number(timeout)
      })
  }))
)
