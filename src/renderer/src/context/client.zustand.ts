/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { useLayoutZustand } from './layout.zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import {
  PersistedClientZustand,
  PersistedClientZustandSchema,
  ClientZustand
} from './client.zustand.types'
import {
  defaultConnectionConfig,
  defaultRegisterConfig,
  CURRENT_CLIENT_ZUSTAND_VERSION,
  migrateClientState,
  carryFormerClientState,
  CLIENT_ZUSTAND_STORAGE_KEY,
  keepCorrupt,
  repairPersisted
} from '@shared'
import { useDataZustand } from './data.zustand'
import { loadSerialPorts } from './serialPorts'
import { onEvent } from '@renderer/events'

/**
 * The version the blob on disk carried, set by `migrate` and read once below.
 *
 * persist calls `migrate` for any version that is not the current one, the ones
 * above it included, and that call is the only place the number is offered.
 */
let persistedVersion: number | undefined

// Debounced IPC sync — avoids flooding the main process on rapid cell edits
let _ipcTimer: ReturnType<typeof setTimeout> | null = null
function syncRegisterMappingToMain(): void {
  if (_ipcTimer) clearTimeout(_ipcTimer)
  _ipcTimer = setTimeout(() => {
    window.api.setRegisterMapping(useClientZustand.getState().registerMapping)
  }, 150)
}

/**
 * Sends the mapping now instead of in 150 ms.
 *
 * For a caller that needs the backend to hold the mapping before its next
 * request. Turning on read configuration reads straight afterwards, and the
 * debounce would let that read go out against the mapping from before.
 */
export const flushRegisterMappingToMain = (): void => {
  if (_ipcTimer) clearTimeout(_ipcTimer)
  _ipcTimer = null
  window.api.setRegisterMapping(useClientZustand.getState().registerMapping)
}

/**
 * Drop the rows on screen, unless something is about to replace them.
 *
 * Address, length and type each change what a read asks for, so the rows from
 * the last read answer a different question. Polling puts new ones there on its
 * own, and so does read configuration.
 */
const clearRegisterDataWhenIdle = (): void => {
  const { clientState, readConfiguration } = useClientZustand.getState()
  if (clientState.polling || readConfiguration) return
  useDataZustand.getState().setRegisterData([])
}

/**
 * Whether a `client_state` push has landed since the module was evaluated.
 *
 * `init` asks main what the client is doing, because main pushes on a change
 * and a window opened after the last push starts on the initial literal. The
 * answer is main's state read when the handler ran, so a push that arrives
 * while the answer is in flight is the newer of the two and keeps its value.
 */
let clientStatePushed = false

carryFormerClientState(localStorage)

export const useClientZustand = create<
  ClientZustand,
  [['zustand/persist', PersistedClientZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      // Config
      init: async () => {
        const { connectionConfig, registerConfig } = get()

        window.api.updateConnectionConfig(connectionConfig)
        window.api.updateRegisterConfig(registerConfig)
        window.api.setReadConfiguration(false)

        set((state) => {
          state.readConfiguration = false
          state.ready = true
        })

        // Ready is set before this, so a store action does not wait on a round
        // trip. The catch is the point of the try: this runs from module scope
        // with nothing awaiting it, and a rejection there is an unhandled one.
        // Falling through leaves the initial literal, which is what the window
        // showed before it asked.
        try {
          const clientState = await window.api.getClientState()
          if (!clientStatePushed)
            set((state) => {
              state.clientState = clientState
            })
        } catch {
          // Main answers this synchronously; a rejection means it is not there.
        }
      },
      connectionConfig: defaultConnectionConfig,
      registerConfig: defaultRegisterConfig,
      // Connection state
      // Register mapping
      name: '',
      setName: (name) =>
        set((state) => {
          state.name = name
        }),
      configReset: undefined,
      acknowledgeConfigReset: () =>
        set((state) => {
          state.configReset = undefined
        }),
      registerMapping: {
        coils: {},
        discrete_inputs: {},
        holding_registers: {},
        input_registers: {}
      },
      setRegisterMapping: (register, key, value) => {
        const type = get().registerConfig.type

        set((state) => {
          // Remove register from mapping when data type is set to 'none'
          if (key === 'dataType' && value === 'none') {
            delete state.registerMapping[type][register]
            return
          }

          if (!state.registerMapping[type][register]) {
            state.registerMapping[type][register] = { [key]: value }
            return
          }

          if (!state.registerMapping[type][register][key]) {
            state.registerMapping[type][register][key] = value
            return
          }

          state.registerMapping[type][register][key] = value
        })

        syncRegisterMappingToMain()
      },
      replaceRegisterMapping: (registerMapping) =>
        set((state) => {
          state.registerMapping = registerMapping
        }),
      clearRegisterMapping: () =>
        set((state) => {
          state.registerMapping = {
            coils: {},
            discrete_inputs: {},
            holding_registers: {},
            input_registers: {}
          }
        }),
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

      // State
      clientState: {
        connectState: 'disconnected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      },
      setClientState: (clientState) =>
        set((state) => {
          state.clientState = clientState
        }),
      ready: false,
      readConfiguration: false,

      // Configuration actions
      valid: {
        host: true,
        com: true,
        lenght: true
      },
      //
      //
      // Protocol
      //
      // Every setter below sends first and writes only what main took, so a
      // payload the schemas refuse leaves both sides on the value they had.
      // `1,5` in a mask field is `NaN`, `UnitIdSchema` refuses it, and a store
      // that wrote it persisted `null` and lost the whole config on the next
      // launch. A round trip is shorter than the gap between two keystrokes, so
      // no field waits on the answer.
      setProtocol: async (protocol) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        if (!(await window.api.updateConnectionConfig({ protocol }))) return

        set((state) => {
          state.connectionConfig.protocol = protocol
        })
      },
      //
      //
      // TCP
      setPort: async (port) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        const newPort = Number(port)
        if (!(await window.api.updateConnectionConfig({ tcp: { options: { port: newPort } } })))
          return

        set((state) => {
          state.connectionConfig.tcp.options.port = newPort
        })
      },
      setHost: async (host, valid) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        // The field reads its text from the store, so an invalid host is kept
        // here and never sent. What the boundary never sees needs no answer.
        if (!valid) {
          set((state) => {
            state.valid.host = false
            state.connectionConfig.tcp.host = host
          })
          return
        }

        if (!(await window.api.updateConnectionConfig({ tcp: { host } }))) return

        set((state) => {
          state.valid.host = true
          state.connectionConfig.tcp.host = host
        })
      },
      //
      //
      // RTU
      setCom: async (com, valid) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        if (!(await window.api.updateConnectionConfig({ rtu: { com } }))) return

        set((state) => {
          state.valid.com = !!valid
          state.connectionConfig.rtu.com = com
        })
      },
      setBaudRate: async (baudRate) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        if (!(await window.api.updateConnectionConfig({ rtu: { options: { baudRate } } }))) return

        set((state) => {
          state.connectionConfig.rtu.options.baudRate = baudRate
        })
      },
      setParity: async (parity) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        if (!(await window.api.updateConnectionConfig({ rtu: { options: { parity } } }))) return

        set((state) => {
          state.connectionConfig.rtu.options.parity = parity
        })
      },
      setDataBits: async (dataBits) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        const newDataBits = Number(dataBits)
        if (
          !(await window.api.updateConnectionConfig({
            rtu: { options: { dataBits: newDataBits } }
          }))
        )
          return

        set((state) => {
          state.connectionConfig.rtu.options.dataBits = newDataBits
        })
      },
      setStopBits: async (stopBits) => {
        const currentState = get()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== 'disconnected') return

        const newStopBits = Number(stopBits)
        if (
          !(await window.api.updateConnectionConfig({
            rtu: { options: { stopBits: newStopBits } }
          }))
        )
          return

        set((state) => {
          state.connectionConfig.rtu.options.stopBits = newStopBits
        })
      },
      //
      //
      // Layout configuration settings
      setAddressBase: async (addressBase) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ addressBase }))) return

        set((state) => {
          state.registerConfig.addressBase = addressBase
        })
      },
      setShow64BitValues: async (show64BitValues) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ show64BitValues }))) return

        set((state) => {
          state.registerConfig.show64BitValues = show64BitValues
        })
      },
      setAdvancedMode: async (advancedMode) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ advancedMode }))) return

        set((state) => {
          state.registerConfig.advancedMode = advancedMode
        })
      },
      // Addressing
      setUnitId: async (unitId) => {
        if (!get().ready) return

        const newUnitId = Number(unitId)
        if (!(await window.api.updateConnectionConfig({ unitId: newUnitId }))) return

        set((state) => {
          state.connectionConfig.unitId = newUnitId
        })
      },
      setAddress: async (address) => {
        const currentState = get()
        if (!currentState.ready) return

        const newAddress = Number(address)
        if (newAddress === currentState.registerConfig.address) return

        if (!(await window.api.updateRegisterConfig({ address: newAddress }))) return

        set((state) => {
          state.registerConfig.address = newAddress
        })
        clearRegisterDataWhenIdle()
      },
      setLength: async (length, valid) => {
        const currentState = get()
        if (!currentState.ready) return

        const newLength = Number(length)

        // The field reads its length from the store, so an empty or zero one is
        // kept here and never sent.
        if (!valid) {
          set((state) => {
            state.valid.lenght = false
            state.registerConfig.length = newLength
          })
          return
        }

        if (!(await window.api.updateRegisterConfig({ length: newLength }))) return

        set((state) => {
          state.valid.lenght = true
          state.registerConfig.length = newLength
        })
        clearRegisterDataWhenIdle()
      },
      setType: async (type) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ type }))) return

        set((state) => {
          state.registerConfig.type = type
        })
        clearRegisterDataWhenIdle()
      },
      setLittleEndian: async (littleEndian) => {
        if (!get().ready) return
        if (!(await window.api.updateRegisterConfig({ littleEndian }))) return

        set((state) => {
          state.registerConfig.littleEndian = littleEndian
        })

        // The rows on screen were read in the other word order, and the
        // conversion happens where the reading does, so they stay that way
        // until the next read. Ask for one, unless something else is about
        // to: polling reads on its own, and a scan is filling the list.
        const { connectState, polling, scanningRegisters } = get().clientState
        const hasRows = useDataZustand.getState().registerData.length > 0
        if (connectState === 'connected' && !polling && !scanningRegisters && hasRows) {
          window.api.read()
        }
      },
      setReadConfiguration: (readConfiguration) =>
        set((state) => {
          if (!get().ready) return
          state.readConfiguration = readConfiguration
          window.api.setReadConfiguration(readConfiguration)
        }),
      // Reading
      setPollRate: async (pollRate) => {
        if (!get().ready) return

        if (pollRate % 1000 !== 0 || pollRate < 1000 || pollRate > 10000) {
          console.error('Invalid poll rate. Must be a multiple of 1000 and between 1000 and 10000.')
          return
        }

        if (!(await window.api.updateRegisterConfig({ pollRate }))) return

        set((state) => {
          state.registerConfig.pollRate = pollRate
        })
      },
      setTimeout: async (timeout) => {
        if (!get().ready) return

        if (timeout % 1000 !== 0 || timeout < 1000 || timeout > 10000) {
          console.error('Invalid timeout. Must be a multiple of 1000 and between 1000 and 10000.')
          return
        }

        if (!(await window.api.updateRegisterConfig({ timeout }))) return

        set((state) => {
          state.registerConfig.timeout = timeout
        })
      },
      // Transaction
      lastSuccessfulTransactionMillis: null,
      setLastSuccessfulTransactionMillis: (value) =>
        set((state) => {
          state.lastSuccessfulTransactionMillis = value
        }),
      // Unit ID Scannning
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
      // Scanning progress
      scanProgress: 0,
      setScanProgress: (scanProgress) =>
        set((state) => {
          state.scanProgress = scanProgress
        }),
      version: '-',

      // Serial port discovery
      serialPorts: [],
      serialPortsLoading: false,
      serialPortValidating: false,
      refreshSerialPorts: () => loadSerialPorts(set),
      validateSerialPort: async (portPath) => {
        set((state) => {
          state.serialPortValidating = true
        })
        try {
          return await window.api.validateSerialPort(portPath)
        } finally {
          set((state) => {
            state.serialPortValidating = false
          })
        }
      }
    })),
    {
      name: CLIENT_ZUSTAND_STORAGE_KEY,
      version: CURRENT_CLIENT_ZUSTAND_VERSION,
      migrate: (state, version) => {
        persistedVersion = version
        return migrateClientState(state, version) as PersistedClientZustand
      },
      partialize: (state) => ({
        name: state.name,
        connectionConfig: state.connectionConfig,
        registerConfig: state.registerConfig,
        registerMapping: state.registerMapping
      })
    }
  )
)

const clientZustand = useClientZustand.getState()

/**
 * Keep the fields that parsed and default the rest, then say which went.
 *
 * This runs while the module graph is still evaluating. notistack assigns its
 * standalone enqueueSnackbar inside the SnackbarProvider constructor, and that
 * provider is built by createRoot().render() in main.tsx, so calling it here
 * throws out of module scope and nothing below this line ever runs: no init, no
 * event listeners, and no React render either. MessageReceiver reads the report
 * once it is mounted, where a provider exists to tell.
 *
 * The blob is copied rather than cleared, because a register mapping worth
 * hundreds of rows is worth having in a bug report even once it is unreadable.
 */
const repair = repairPersisted(
  PersistedClientZustandSchema,
  clientZustand,
  useClientZustand.getInitialState(),
  persistedVersion !== undefined && persistedVersion > CURRENT_CLIENT_ZUSTAND_VERSION
)

if (repair.reset !== undefined) {
  console.warn('client config repaired', repair.reset)
  keepCorrupt(localStorage, CLIENT_ZUSTAND_STORAGE_KEY)
  useClientZustand.setState({ ...repair.state, configReset: repair.reset })
}

// Sync the main process state with the front end
clientZustand.init()

//
//
//
//
// Listen to events to set the state

// Client state, like polling, scanning, etc.
onEvent('client_state', (clientState) => {
  clientStatePushed = true
  const clientZustand = useClientZustand.getState()
  clientZustand.setClientState(clientState)
})

// Transactions from the transation log
onEvent('transaction', (transaction) => {
  const clientZustand = useClientZustand.getState()
  clientZustand.addTransaction(transaction)
})

// Unit ID scanning results
onEvent('scan_unit_id_result', (scanUnitIDResult) => {
  const clientZustand = useClientZustand.getState()
  clientZustand.addScanUnitIdResult(scanUnitIDResult)
})

// Scan progress
onEvent('scan_progress', (scanProgress) => {
  const clientZustand = useClientZustand.getState()
  clientZustand.setScanProgress(scanProgress)
})

//
//
// Stop scanning when reloaded, shouldn't be a problem with the build app,
// but just in case and for development, stop scanning when the frontend is reloaded
window.api.stopScanningUnitIds()

window.api.getAppVersion().then((version) => {
  useLayoutZustand.getState().setVersion(version)
})
