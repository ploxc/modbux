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
      setProtocol: (protocol) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          state.connectionConfig.protocol = protocol
          window.api.updateConnectionConfig({ protocol })
        }),
      //
      //
      // TCP
      setPort: (port) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          const newPort = Number(port)
          state.connectionConfig.tcp.options.port = newPort
          window.api.updateConnectionConfig({ tcp: { options: { port: newPort } } })
        }),
      setHost: (host, valid) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          state.valid.host = !!valid
          state.connectionConfig.tcp.host = host
          if (!valid) return
          window.api.updateConnectionConfig({ tcp: { host } })
        }),
      //
      //
      // RTU
      setCom: (com, valid) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          state.valid.com = !!valid
          state.connectionConfig.rtu.com = com
          window.api.updateConnectionConfig({ rtu: { com } })
        }),
      setBaudRate: (baudRate) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          state.connectionConfig.rtu.options.baudRate = baudRate
          window.api.updateConnectionConfig({ rtu: { options: { baudRate } } })
        }),
      setParity: (parity) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          state.connectionConfig.rtu.options.parity = parity
          window.api.updateConnectionConfig({ rtu: { options: { parity } } })
        }),
      setDataBits: (dataBits) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          const newDataBits = Number(dataBits)
          state.connectionConfig.rtu.options.dataBits = newDataBits
          window.api.updateConnectionConfig({ rtu: { options: { dataBits: newDataBits } } })
        }),
      setStopBits: (stopBits) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          if (currentState.clientState.connectState !== 'disconnected') return

          const newStopBits = Number(stopBits)
          state.connectionConfig.rtu.options.stopBits = newStopBits
          window.api.updateConnectionConfig({ rtu: { options: { stopBits: newStopBits } } })
        }),
      //
      //
      // Layout configuration settings
      setAddressBase: (addressBase) =>
        set((state) => {
          if (!get().ready) return
          state.registerConfig.addressBase = addressBase
          window.api.updateRegisterConfig({ addressBase })
        }),
      setShow64BitValues: (show64BitValues) =>
        set((state) => {
          if (!get().ready) return
          state.registerConfig.show64BitValues = show64BitValues
          window.api.updateRegisterConfig({ show64BitValues })
        }),
      setAdvancedMode: (advancedMode) =>
        set((state) => {
          if (!get().ready) return
          state.registerConfig.advancedMode = advancedMode
          window.api.updateRegisterConfig({ advancedMode })
        }),
      // Addressing
      setUnitId: (unitId) =>
        set((state) => {
          if (!get().ready) return
          const newUnitId = Number(unitId)
          state.connectionConfig.unitId = newUnitId
          window.api.updateConnectionConfig({ unitId: newUnitId })
        }),
      setAddress: (address) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          const newAddress = Number(address)
          if (newAddress === currentState.registerConfig.address) return

          state.registerConfig.address = newAddress
          window.api.updateRegisterConfig({ address: newAddress })

          // Reset registerdata when not polling and not in readConfiguration mode
          if (!currentState.clientState.polling && !currentState.readConfiguration)
            useDataZustand.getState().setRegisterData([])
        }),
      setLength: (length, valid) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          state.valid.lenght = !!valid
          const newLength = Number(length)
          state.registerConfig.length = newLength
          if (!valid) return
          window.api.updateRegisterConfig({ length: newLength })

          // Reset registerdata when not polling and not in readConfiguration mode
          if (!currentState.clientState.polling && !currentState.readConfiguration)
            useDataZustand.getState().setRegisterData([])
        }),
      setType: (type) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          state.registerConfig.type = type
          window.api.updateRegisterConfig({ type })

          // Reset registerdata when not polling and not in readConfiguration mode
          if (!currentState.clientState.polling && !currentState.readConfiguration)
            useDataZustand.getState().setRegisterData([])
        }),
      setLittleEndian: (littleEndian) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return
          state.registerConfig.littleEndian = littleEndian
          window.api.updateRegisterConfig({ littleEndian })

          // The rows on screen were read in the other word order, and the
          // conversion happens where the reading does, so they stay that way
          // until the next read. Ask for one, unless something else is about
          // to: polling reads on its own, and a scan is filling the list.
          const { connectState, polling, scanningRegisters } = currentState.clientState
          const hasRows = useDataZustand.getState().registerData.length > 0
          if (connectState === 'connected' && !polling && !scanningRegisters && hasRows) {
            window.api.read()
          }
        }),
      setReadConfiguration: (readConfiguration) =>
        set((state) => {
          if (!get().ready) return
          state.readConfiguration = readConfiguration
          window.api.setReadConfiguration(readConfiguration)
        }),
      // Reading
      setPollRate: (pollRate) =>
        set((state) => {
          if (!get().ready) return

          if (pollRate % 1000 !== 0 || pollRate < 1000 || pollRate > 10000) {
            console.error(
              'Invalid poll rate. Must be a multiple of 1000 and between 1000 and 10000.'
            )
            return
          }

          state.registerConfig.pollRate = pollRate
          window.api.updateRegisterConfig({ pollRate })
        }),
      setTimeout: (timeout) =>
        set((state) => {
          if (!get().ready) return

          if (timeout % 1000 !== 0 || timeout < 1000 || timeout > 10000) {
            console.error('Invalid timeout. Must be a multiple of 1000 and between 1000 and 10000.')
            return
          }

          state.registerConfig.timeout = timeout
          window.api.updateRegisterConfig({ timeout })
        }),
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
      refreshSerialPorts: async () => {
        set((state) => {
          state.serialPortsLoading = true
        })
        const ports = await window.api.listSerialPorts()
        set((state) => {
          state.serialPorts = ports
          state.serialPortsLoading = false
        })
      },
      validateSerialPort: async (portPath) => {
        set((state) => {
          state.serialPortValidating = true
        })
        const result = await window.api.validateSerialPort(portPath)
        set((state) => {
          state.serialPortValidating = false
        })
        return result
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
