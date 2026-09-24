/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { ClientData, LiveZustand } from './live.zustand.types'
import { dataOf, emptyClientData } from './live.zustand.helpers'
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
import { selectedClientUuid, useClientZustand } from './client.zustand'
import { onEvent } from '@renderer/events'
import { RegisterData, ScanUnitIDResult, Transaction, dummyWords } from '@shared'

export { dataOf }

/** The data of the client the view shows, read now rather than subscribed to. */
export const getShownData = (): ClientData =>
  dataOf(useLiveZustand.getState(), selectedClientUuid())

/** Runs `recipe` on the data under `uuid`, made first when there is none. */
const onData = (state: LiveZustand, uuid: string, recipe: (data: ClientData) => void): void => {
  const data = state.clients[uuid] ?? emptyClientData()
  state.clients[uuid] = data
  recipe(data)
}

/**
 * What main pushes about each client, held for as long as the window lives,
 * under the uuid the client store holds it under.
 *
 * Six of the ten `EVENTS_TO_RENDERER` are a client's and all six land here.
 * The other four drive a server, the windows or the snackbar.
 *
 * Nothing here is persisted, and that is the point. zustand's persist wraps
 * `setState` and serializes the whole partialized state on every call with no
 * debounce, so a field written at event rate inside `client.zustand` paid for
 * the register mapping it keeps on every write. Measured in the app's own
 * renderer on a 219955 byte blob, 1000 of those writes cost 887 ms of the main
 * thread, 432 ms of it the `JSON.stringify` alone and 249 ms the
 * `localStorage.setItem` alone, so the store Chromium keeps off the main thread
 * does not take that second part off it either. A scan sends `scan_progress`
 * at most every 100 ms, and a unit id scan sends a result per id and a
 * transaction per request.
 */
export const useLiveZustand = create<LiveZustand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    clients: {},

    // Register data
    setRegisterData: (uuid, registerData) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.registerData = registerData
        })
      ),
    appendRegisterData: (uuid, registerData) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.registerData.push(...registerData)
        })
      ),
    setAddressGroups: (uuid, addressGroups) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.addressGroups = addressGroups
        })
      ),

    // State
    setClientState: (uuid, clientState) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.clientState = clientState
        })
      ),

    // Transaction log
    addTransactions: (uuid, transactions) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.transactions.unshift(...[...transactions].reverse())
          while (data.transactions.length > 1000) data.transactions.pop()
        })
      ),
    clearTransactions: (uuid) => {
      pendingTransactions.drop(uuid)
      set((state) =>
        onData(state, uuid, (data) => {
          data.transactions = []
        })
      )
    },
    setLastSuccessfulTransactionMillis: (uuid, value) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.lastSuccessfulTransactionMillis = value
        })
      ),

    // Unit ID scanning
    addScanUnitIdResults: (uuid, scanUnitIdResults) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.scanUnitIdResults.unshift(...[...scanUnitIdResults].reverse())
          while (data.scanUnitIdResults.length > 256) data.scanUnitIdResults.pop()
        })
      ),
    clearScanUnitIdResults: (uuid) => {
      pendingUnitIdResults.drop(uuid)
      set((state) =>
        onData(state, uuid, (data) => {
          data.scanUnitIdResults = []
        })
      )
    },

    // Scan progress
    setScanProgress: (uuid, scanProgress) =>
      set((state) =>
        onData(state, uuid, (data) => {
          data.scanProgress = scanProgress
        })
      ),

    dropClient: (uuid) => {
      pendingScanRows.drop(uuid)
      pendingUnitIdResults.drop(uuid)
      pendingTransactions.drop(uuid)
      clientStatePushed.delete(uuid)
      set((state) => {
        delete state.clients[uuid]
      })
    }
  }))
)

/** Populate a client's grid with its configured register placeholders */
export const showMapping = (uuid: string = selectedClientUuid()): void => {
  const client = useClientZustand.getState().clients[uuid]
  if (!client) return
  const registerData: RegisterData[] = []
  const { registerMapping } = client
  const { type } = client.registerConfig

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

  useLiveZustand.getState().setRegisterData(uuid, registerData)
}

/** How long a batch of what main sends at event rate waits before it is written. */
const SCAN_FLUSH_MS = 100

/**
 * What main sends at event rate, held back per client and written a batch at a
 * time on a timer, so the number of renders follows the clock rather than the
 * number of messages.
 */
const heldOnTimer = <T>(
  write: (uuid: string, items: T[]) => void
): {
  push: (uuid: string, items: T[]) => void
  flush: (uuid: string) => void
  drop: (uuid: string) => void
} => {
  const pending = new Map<string, { items: T[]; timeout: NodeJS.Timeout }>()
  const drop = (uuid: string): void => {
    clearTimeout(pending.get(uuid)?.timeout)
    pending.delete(uuid)
  }
  const flush = (uuid: string): void => {
    const held = pending.get(uuid)
    drop(uuid)
    if (held) write(uuid, held.items)
  }
  const push = (uuid: string, items: T[]): void => {
    const held = pending.get(uuid)
    if (held) {
      held.items.push(...items)
      return
    }
    pending.set(uuid, { items: [...items], timeout: setTimeout(() => flush(uuid), SCAN_FLUSH_MS) })
  }
  return { push, flush, drop }
}

/**
 * Rows found by a scan. A scan sends one message per chunk, and the grid
 * renders the whole list again on each one, so the work per chunk grows with
 * what has been found already. With the grid on screen a scan of 2000
 * addresses in chunks of one took 208 seconds instead of 26, and the window
 * stopped answering for most of it. The server view solves the same problem
 * the same way.
 */
const pendingScanRows = heldOnTimer<RegisterData>((uuid, rows) =>
  useLiveZustand.getState().appendRegisterData(uuid, rows)
)

/**
 * A unit id scan sends a result per unit id, and the table drew itself again
 * on each: a scan of 255 ids lagged behind itself.
 */
const pendingUnitIdResults = heldOnTimer<ScanUnitIDResult>((uuid, results) =>
  useLiveZustand.getState().addScanUnitIdResults(uuid, results)
)

/**
 * Main sends a transaction per request, and a register scan in chunks of one
 * against a server that answers at once sent them faster than the window could
 * write them.
 */
const pendingTransactions = heldOnTimer<Transaction>((uuid, transactions) =>
  useLiveZustand.getState().addTransactions(uuid, transactions)
)

/** Nothing may survive into the client's next scan, which starts from an empty grid. */
export const dropPendingScanRows = (uuid: string): void => pendingScanRows.drop(uuid)

/** The clients a `client_state` push has landed for since the module was evaluated. */
const clientStatePushed = new Set<string>()

/**
 * Ask main what every client is doing, because a push says only that it
 * changed, and write each state no push has landed for since the ask. A push
 * that arrives while the answer is in flight is the newer of the two. A client
 * the client store does not hold gets nothing, as a push about it gets
 * nothing: main outlives a window, and one that came back on a reset store
 * does not hold the clients main still does.
 *
 * Main pushes `client_state` on a change, so a window opened after the last
 * one starts on the defaults: on macos the app outlives its windows, and the
 * window that comes back showed Connect over a client that was connected and
 * polling. The ask sits here rather than in `client.zustand`'s `init` because
 * these two modules import each other, and a name reached across that cycle
 * while the other half is still evaluating is a name in its temporal dead
 * zone. It threw into `init`'s catch, which reported nothing. The answer
 * reaches back into `client.zustand` only from inside the callback: an invoke
 * answers in a task of its own, after both modules have evaluated. A stub that
 * answers in a microtask can land it while the import chain is still under
 * way, and vitest then hands over the half that has not finished.
 *
 * The guard is the one `init` carries: the split out server window shows no
 * client.
 */
if (!window.api.isServerWindow) {
  window.api
    .getClientStates()
    .then((clientStates) => {
      for (const [uuid, clientState] of Object.entries(clientStates)) {
        if (!isHeld(uuid) || clientStatePushed.has(uuid)) continue
        useLiveZustand.getState().setClientState(uuid, clientState)
      }
    })
    .catch((error) => console.error('The client state main holds was not read:', error))
}

/**
 * Whether an event is about a client the client store holds.
 *
 * Main sends every client's events to the main window. A client taken away
 * still sends the state its disconnect leaves, after the store let go of it.
 */
const isHeld = (uuid: string): boolean => Object.hasOwn(useClientZustand.getState().clients, uuid)

// Data read from the registers
onEvent('register_data', ({ uuid, registerData }) => {
  if (!isHeld(uuid)) return
  const liveZustand = useLiveZustand.getState()

  if (dataOf(liveZustand, uuid).clientState.scanningRegisters) {
    pendingScanRows.push(uuid, registerData)
  } else {
    // A poll replaces the grid, so anything a scan left waiting is stale.
    pendingScanRows.drop(uuid)
    liveZustand.setRegisterData(uuid, registerData)
  }

  liveZustand.setLastSuccessfulTransactionMillis(uuid, DateTime.now().toMillis())
})

onEvent('address_groups', ({ uuid, addressGroups }) => {
  if (!isHeld(uuid)) return
  useLiveZustand.getState().setAddressGroups(uuid, addressGroups)
})

// Client state, like polling, scanning, etc.
onEvent('client_state', ({ uuid, clientState }) => {
  if (!isHeld(uuid)) return
  clientStatePushed.add(uuid)
  // Main sends a scan's last rows before the state that ends it, so they are
  // written before the button says the scan stopped, not up to a flush later.
  if (!clientState.scanningRegisters) pendingScanRows.flush(uuid)
  if (!clientState.scanningUnitIds) pendingUnitIdResults.flush(uuid)
  useLiveZustand.getState().setClientState(uuid, clientState)
})

// Transactions from the transation log
onEvent('transaction', ({ uuid, transaction }) => {
  if (isHeld(uuid)) pendingTransactions.push(uuid, [transaction])
})

// Unit ID scanning results
onEvent('scan_unit_id_result', ({ uuid, result }) => {
  if (isHeld(uuid)) pendingUnitIdResults.push(uuid, [result])
})

// Scan progress
onEvent('scan_progress', ({ uuid, progress }) => {
  if (!isHeld(uuid)) return
  useLiveZustand.getState().setScanProgress(uuid, progress)
})
