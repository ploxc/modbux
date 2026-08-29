/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { DataZustand } from './data.zustand.types'
import { mutative } from 'zustand-mutative'
import { DateTime } from 'luxon'
import { useRootZustand } from './root.zustand'
import { onEvent } from '@renderer/events'
import { RegisterData, dummyWords } from '@shared'

export const useDataZustand = create<DataZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    // Register data
    registerData: [],
    setRegisterData: (data) =>
      set((state) => {
        state.registerData = data
      }),
    appendRegisterData: (data) =>
      set((state) => {
        state.registerData.push(...data)
      }),
    // Address groups
    addressGroups: [],
    setAddressGroups: (groups) =>
      set((state) => {
        state.addressGroups = groups
      })
  }))
)

/** Populate grid with configured register placeholders */
export const showMapping = (): void => {
  const registerData: RegisterData[] = []
  const registerMapping = useRootZustand.getState().registerMapping
  const type = useRootZustand.getState().registerConfig.type

  Object.entries(registerMapping[type]).forEach(([addressString, m]) => {
    if (!m || m.dataType === 'none' || !m.dataType) return
    const address = parseInt(addressString, 10)

    const row: RegisterData = {
      id: address,
      buffer: new Uint8Array([0, 0]),
      hex: '0000',
      words: { ...dummyWords },
      bit: false,
      isScanned: false
    }
    registerData.push(row)
  })

  useDataZustand.getState().setRegisterData(registerData)
}

/**
 * Rows found by a scan, held back and written in batches.
 *
 * A scan sends one message per chunk, and the grid renders the whole list
 * again on each one, so the work per chunk grows with what has been found
 * already. With the grid on screen a scan of 2000 addresses in chunks of one
 * took 208 seconds instead of 26, and the window stopped answering for most of
 * it. Collecting the rows and writing them on a timer puts the number of
 * renders on the clock instead of on the chunk count. The server view solves
 * the same problem the same way.
 */
const SCAN_FLUSH_MS = 100

let pendingScanRows: RegisterData[] = []
let scanFlushTimeout: NodeJS.Timeout | undefined

const flushScanRows = (): void => {
  clearTimeout(scanFlushTimeout)
  scanFlushTimeout = undefined
  if (pendingScanRows.length === 0) return
  useDataZustand.getState().appendRegisterData(pendingScanRows)
  pendingScanRows = []
}

/** Nothing may survive into the next scan, which starts from an empty grid. */
export const dropPendingScanRows = (): void => {
  clearTimeout(scanFlushTimeout)
  scanFlushTimeout = undefined
  pendingScanRows = []
}

// Data read from the registers
onEvent('register_data', (registerData) => {
  const state = useDataZustand.getState()
  const rootState = useRootZustand.getState()

  if (rootState.clientState.scanningRegisters) {
    pendingScanRows.push(...registerData)
    if (!scanFlushTimeout) scanFlushTimeout = setTimeout(flushScanRows, SCAN_FLUSH_MS)
  } else {
    // A poll replaces the grid, so anything a scan left waiting is stale.
    dropPendingScanRows()
    state.setRegisterData(registerData)
  }

  rootState.setLastSuccessfulTransactionMillis(DateTime.now().toMillis())
})

onEvent('address_groups', (addressGroups) => {
  const state = useDataZustand.getState()
  state.setAddressGroups(addressGroups)
})
