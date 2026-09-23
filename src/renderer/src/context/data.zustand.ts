/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { DataZustand } from './data.zustand.types'
import { mutative } from 'zustand-mutative'
import { DateTime } from 'luxon'
// This import closes a cycle: `client.zustand.ts` imports this module for
// `showMapping` and for the store its guards read `connectState` out of. Both
// sides hold because every name either side reaches across the cycle is
// reached from inside a function body, which runs after both modules have
// evaluated. Neither tail may name one: `useClientZustand.getState()` beside
// the `create` call below threw "Cannot read properties of undefined (reading
// 'getState')" before `client.zustand.test.ts` ran a single case, and at
// startup there is no React render behind that to catch it.
import { useClientZustand } from './client.zustand'
import { onEvent } from '@renderer/events'
import { ClientState, RegisterData, defaultClientState, dummyWords } from '@shared'

/**
 * What main pushes about the client, held for as long as the window lives.
 *
 * Six of the ten `EVENTS_TO_RENDERER` are the client's and all six land here.
 * The other four drive a server, the windows or the snackbar.
 *
 * Nothing here is persisted, and that is the point. zustand's persist wraps
 * `setState` and serializes the whole partialized state on every call with no
 * debounce, so a field written at event rate inside `client.zustand` paid for
 * the register mapping it keeps on every write. Measured in the app's own
 * renderer on a 219955 byte blob, 1000 of those writes cost 887 ms of the main
 * thread, 432 ms of it the `JSON.stringify` alone and 249 ms the
 * `localStorage.setItem` alone, so the store Chromium keeps off the main thread
 * does not take that second part off it either. `modbusClient`'s `scanUnitIds`
 * sets `_totalScans` to the unit id count times the register type count, so a
 * scan of 1 through 247 over four types sends 988 `scan_progress` events.
 */
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
      }),

    // State
    clientState: { ...defaultClientState },
    setClientState: (clientState) =>
      set((state) => {
        state.clientState = clientState
      }),

    // Transaction log
    transactions: [],
    addTransaction: (transaction) =>
      set((state) => {
        state.transactions.unshift(transaction)
        while (state.transactions.length > 1000) state.transactions.pop()
      }),
    clearTransactions: () =>
      set((state) => {
        state.transactions = []
      }),
    lastSuccessfulTransactionMillis: null,
    setLastSuccessfulTransactionMillis: (value) =>
      set((state) => {
        state.lastSuccessfulTransactionMillis = value
      }),

    // Unit ID scanning
    scanUnitIdResults: [],
    addScanUnitIdResult: (scanUnitIDResult) =>
      set((state) => {
        state.scanUnitIdResults.unshift(scanUnitIDResult)
        while (state.scanUnitIdResults.length > 256) state.scanUnitIdResults.pop()
      }),
    clearScanUnitIdResults: () =>
      set((state) => {
        state.scanUnitIdResults = []
      }),

    // Scan progress
    scanProgress: 0,
    setScanProgress: (scanProgress) =>
      set((state) => {
        state.scanProgress = scanProgress
      })
  }))
)

/** Populate grid with configured register placeholders */
export const showMapping = (): void => {
  const registerData: RegisterData[] = []
  const registerMapping = useClientZustand.getState().registerMapping
  const type = useClientZustand.getState().registerConfig.type

  Object.entries(registerMapping[type]).forEach(([addressString, mapValue]) => {
    if (!mapValue || mapValue.dataType === 'none' || !mapValue.dataType) return
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

/** Whether a `client_state` push has landed since the module was evaluated. */
let clientStatePushed = false

/**
 * Write the state main answered with, unless a push has landed since the ask.
 *
 * A push that arrives while the answer is in flight is the newer of the two
 * and keeps its value.
 */
const adoptAnsweredClientState = (clientState: ClientState): void => {
  if (clientStatePushed) return
  useDataZustand.getState().setClientState(clientState)
}

/**
 * Ask main what the client is doing, because a push says only that it changed.
 *
 * Main pushes `client_state` on a change, so a window opened after the last
 * one starts on the literal above: on macos the app outlives its windows, and
 * the window that comes back showed Connect over a client that was connected
 * and polling. The ask sits here rather than in `client.zustand`'s `init`
 * because these two modules import each other, and a name reached across that
 * cycle while the other half is still evaluating is a name in its temporal
 * dead zone. It threw into `init`'s catch, which reported nothing.
 *
 * The guard is the one `init` carries: `client_state` is about the one client
 * main holds, and the split out server window shows none of it.
 */
if (!window.api.isServerWindow) {
  window.api
    .getClientState()
    .then(adoptAnsweredClientState)
    .catch((error) => console.error('The client state main holds was not read:', error))
}

// Data read from the registers
onEvent('register_data', (registerData) => {
  const dataZustand = useDataZustand.getState()

  if (dataZustand.clientState.scanningRegisters) {
    pendingScanRows.push(...registerData)
    if (!scanFlushTimeout) scanFlushTimeout = setTimeout(flushScanRows, SCAN_FLUSH_MS)
  } else {
    // A poll replaces the grid, so anything a scan left waiting is stale.
    dropPendingScanRows()
    dataZustand.setRegisterData(registerData)
  }

  dataZustand.setLastSuccessfulTransactionMillis(DateTime.now().toMillis())
})

onEvent('address_groups', (addressGroups) => {
  const dataZustand = useDataZustand.getState()
  dataZustand.setAddressGroups(addressGroups)
})

// Client state, like polling, scanning, etc.
onEvent('client_state', (clientState) => {
  clientStatePushed = true
  // Main sends a scan's last rows before the state that ends it, so they are
  // written before the button says the scan stopped, not up to a flush later.
  if (!clientState.scanningRegisters) flushScanRows()
  const dataZustand = useDataZustand.getState()
  dataZustand.setClientState(clientState)
})

// Transactions from the transation log
onEvent('transaction', (transaction) => {
  const dataZustand = useDataZustand.getState()
  dataZustand.addTransaction(transaction)
})

// Unit ID scanning results
onEvent('scan_unit_id_result', (scanUnitIDResult) => {
  const dataZustand = useDataZustand.getState()
  dataZustand.addScanUnitIdResult(scanUnitIDResult)
})

// Scan progress
onEvent('scan_progress', (scanProgress) => {
  const dataZustand = useDataZustand.getState()
  dataZustand.setScanProgress(scanProgress)
})
