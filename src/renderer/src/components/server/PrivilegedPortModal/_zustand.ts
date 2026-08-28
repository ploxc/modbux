/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { PrivilegedPortFixMode, PrivilegedPortStatus } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface PrivilegedPortZustand {
  open: boolean
  setOpen: (open: boolean) => void
  status: PrivilegedPortStatus | null
  setStatus: (status: PrivilegedPortStatus | null) => void
  busy: boolean
  setBusy: (busy: boolean) => void
  /** Ticked "don't ask again", written to storage when the modal closes. */
  dontAsk: boolean
  setDontAsk: (dontAsk: boolean) => void
  /**
   * Drives both the command on screen and the command that runs, so the two
   * can never drift apart.
   */
  mode: PrivilegedPortFixMode
  setMode: (mode: PrivilegedPortFixMode) => void
}

export const usePrivilegedPortZustand = create<
  PrivilegedPortZustand,
  [['zustand/mutative', never]]
>(
  mutative((set) => ({
    open: false,
    setOpen: (open) =>
      set((state) => {
        state.open = open
      }),
    status: null,
    setStatus: (status) =>
      set((state) => {
        state.status = status
      }),
    busy: false,
    setBusy: (busy) =>
      set((state) => {
        state.busy = busy
      }),
    dontAsk: false,
    setDontAsk: (dontAsk) =>
      set((state) => {
        state.dontAsk = dontAsk
      }),
    mode: 'persist',
    setMode: (mode) =>
      set((state) => {
        state.mode = mode
      })
  }))
)
