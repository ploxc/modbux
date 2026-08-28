/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { SerialGroupStatus } from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface SerialGroupZustand {
  open: boolean
  setOpen: (open: boolean) => void
  status: SerialGroupStatus | null
  setStatus: (status: SerialGroupStatus | null) => void
  busy: boolean
  setBusy: (busy: boolean) => void
  /** The command has run: the group is in the file and waits for the next login. */
  done: boolean
  setDone: (done: boolean) => void
  /**
   * A no, for this run of the app only. Switching transports back and forth
   * should not ask again; starting Modbux tomorrow should. The store lives
   * exactly as long as the window, which is the same thing.
   */
  declined: boolean
  setDeclined: (declined: boolean) => void
}

export const useSerialGroupZustand = create<SerialGroupZustand, [['zustand/mutative', never]]>(
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
    done: false,
    setDone: (done) =>
      set((state) => {
        state.done = done
      }),
    declined: false,
    setDeclined: (declined) =>
      set((state) => {
        state.declined = declined
      })
  }))
)
