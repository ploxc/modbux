import { ConnectionSettings, ConnectionSettingsSchema, defaultConnectionSettings } from '@shared'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { mutative } from 'zustand-mutative'
import { ConnectionZustand } from './connection.zustand.types'

const isServerWindow = window.api.isServerWindow

/** The settings the store holds, without its setter. */
const settingsOf = (state: ConnectionZustand): ConnectionSettings => ({
  reconnectAttempts: state.reconnectAttempts,
  reconnectFirstWait: state.reconnectFirstWait,
  reconnectLongestWait: state.reconnectLongestWait,
  reconnectWhileLogging: state.reconnectWhileLogging,
  offlineAfterTimeouts: state.offlineAfterTimeouts,
  maxPollInterval: state.maxPollInterval
})

/**
 * Hand main the settings as the store holds them. Only the main window does:
 * both windows evaluate this module, and Settings is drawn in the main window.
 */
const push = (): void => {
  if (isServerWindow) return
  window.api.setConnectionSettings(settingsOf(useConnectionZustand.getState()))
}

/**
 * How every client meets a connection or a unit that does not answer, set for
 * the whole app in Settings and persisted.
 */
export const useConnectionZustand = create<
  ConnectionZustand,
  [['zustand/persist', ConnectionSettings], ['zustand/mutative', never]]
>(
  persist(
    mutative((set) => ({
      ...defaultConnectionSettings,
      setConnectionSetting: (key, value): void => {
        set((state) => {
          Object.assign(state, { [key]: value })
        })
        push()
      }
    })),
    {
      name: 'connection.zustand',
      version: 1,
      // A stored blob that does not parse leaves the defaults.
      merge: (persisted, current) => {
        const parsed = ConnectionSettingsSchema.safeParse(persisted)
        return parsed.success ? { ...current, ...parsed.data } : current
      },
      partialize: settingsOf
    }
  )
)

// Main starts with the defaults, so this window hands it the stored ones.
push()
