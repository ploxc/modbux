/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  PrivilegedPortFixMode,
  PrivilegedPortStatus,
  UNPRIVILEGED_PORT_START_TARGET
} from '@shared'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

/** Remembered across restarts: a user who says no once should not be nagged. */
const DISMISS_KEY = 'privilegedPortPromptDismissed'

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
  /**
   * Asks whether the port floor is in the way and opens the modal when it is.
   *
   * Detection is not a button press, so it belongs here rather than in a
   * component effect, which is where `SerialGroupModal`'s twin already sits.
   * The stored dismissal is read here too: the one place that decides whether
   * to ask is the one place that asks.
   *
   * `isStale` is asked once, after the answer is in and before anything is
   * written. A caller whose reason for asking went away while the round trip
   * was out says so there: opening and then closing again is a flash on
   * screen, and an older call closing what a newer one opened would leave the
   * question unasked for the rest of the session.
   */
  check: (isStale?: () => boolean) => Promise<void>
  /** Closes, writing the dismissal when the box is ticked. */
  close: () => void
}

export const usePrivilegedPortZustand = create<
  PrivilegedPortZustand,
  [['zustand/mutative', never]]
>(
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
    dontAsk: false,
    setDontAsk: (dontAsk) =>
      set((state) => {
        state.dontAsk = dontAsk
      }),
    mode: 'persist',
    setMode: (mode) =>
      set((state) => {
        state.mode = mode
      }),
    check: async (isStale) => {
      if (localStorage.getItem(DISMISS_KEY) === 'true') return
      const { setStatus, setOpen } = get()
      try {
        // Always ask about 502 rather than the port in use. By the time the
        // view renders, an unbindable 502 has already become 1024, and asking
        // about 1024 would report no problem at all.
        const result = await window.api.getPrivilegedPortStatus(UNPRIVILEGED_PORT_START_TARGET)
        if (isStale?.()) return
        // Close rather than return: the store outlives a remount, so a stale
        // open would otherwise keep an answered question on screen.
        if (!result.needsElevation) return setOpen(false)
        setStatus(result)
        setOpen(true)
      } catch {
        // Detection is a convenience. Never let it break the server view.
      }
    },
    close: () => {
      const { dontAsk, setOpen } = get()
      if (dontAsk) localStorage.setItem(DISMISS_KEY, 'true')
      setOpen(false)
    }
  }))
)
