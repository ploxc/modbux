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
  /**
   * Asks whether the group is in the way and opens the modal when it is.
   * Resolves true when it opened, so Connect can hold off rather than fail on
   * a permission error. `force` is for that press: a no said to an unprompted
   * question should not silence the answer to something you just asked for.
   */
  check: (force?: boolean) => Promise<boolean>
}

export const useSerialGroupZustand = create<SerialGroupZustand, [['zustand/mutative', never]]>(
  mutative((set, get) => ({
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
      }),
    check: async (force = false) => {
      const { declined, setStatus, setDone, setOpen } = get()
      if (declined && !force) return false
      try {
        const result = await window.api.getSerialGroupStatus()
        if (!result.needsMembership && !result.pendingLogin) {
          // Close rather than return: the store outlives a remount, so a stale
          // open would otherwise keep an answered question on screen.
          setOpen(false)
          return false
        }
        setStatus(result)
        setDone(result.pendingLogin)
        setOpen(true)
        return true
      } catch {
        // Detection is a convenience. Never let it break the client view.
        return false
      }
    }
  }))
)
