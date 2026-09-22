import { SerialPortInfo } from '@shared'

/** The two fields a store keeps a serial port list in. */
export interface SerialPortsSlice {
  serialPorts: SerialPortInfo[]
  serialPortsLoading: boolean
}

/**
 * Fills a store's port list, and releases its loading flag either way.
 *
 * Both stores hold one of these, and both refresh buttons are disabled while
 * the flag is set, so a flag left true is a button that never comes back.
 * `listSerialPorts` in `modbusClient/serialPorts.ts` catches its own failures and answers
 * `[]`, so today only a change in main reaches the `finally`.
 */
export const loadSerialPorts = async <State extends SerialPortsSlice>(
  set: (recipe: (state: State) => void) => void
): Promise<void> => {
  set((state) => {
    state.serialPortsLoading = true
  })
  try {
    const ports = await window.api.listSerialPorts()
    set((state) => {
      state.serialPorts = ports
    })
  } finally {
    set((state) => {
      state.serialPortsLoading = false
    })
  }
}
