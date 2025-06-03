/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { persist } from 'zustand/middleware'
import { PersistedRootZustand, PersistedRootZustandSchema, RootZusand } from './root.zustand.types'
import { defaultConnectionConfig, defaultRegisterConfig } from '@shared'
import { useDataZustand } from './data.zustand'
import { onEvent } from '@renderer/events'

export const useRootZustand = create<
  RootZusand,
  [['zustand/persist', PersistedRootZustand], ['zustand/mutative', never]]
>(
  persist(
    mutative((set, get) => ({
      // Config
      init: async () => {
        const { connectionConfig, registerConfig } = get()
        registerConfig.readConfiguration = false

        window.api.updateConnectionConfig(connectionConfig)
        window.api.updateRegisterConfig(registerConfig)

        set((state) => {
          // On init always set the readConfiguration to false
          state.registerConfig.readConfiguration = registerConfig.readConfiguration
          state.ready = true
        })
      },
      connectionConfig: defaultConnectionConfig,
      registerConfig: defaultRegisterConfig,
      // Connection state
      // Register mapping
      registerMapping: {
        coils: {},
        discrete_inputs: {},
        holding_registers: {},
        input_registers: {}
      },
      setRegisterMapping: (register, key, value) => {
        const type = get().registerConfig.type

        return set((state) => {
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

      // State
      clientState: {
        connectState: 'disconnected',
        polling: false,
        scanningUniId: false,
        scanningRegisters: false
      },
      setClientState: (clientState) =>
        set((state) => {
          state.clientState = clientState
        }),
      ready: false,

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
          if (!valid) return
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
          state.registerConfig.address = newAddress
          window.api.updateRegisterConfig({ address: newAddress })

          // Reset registerdata when not polling
          if (!currentState.clientState.polling) useDataZustand.getState().setRegisterData([])
        }),
      setLength: (length, valid) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          state.valid.lenght = !!valid
          const newLength = Number(length)
          state.registerConfig.length = Number(length)
          if (!valid) return
          window.api.updateRegisterConfig({ length: newLength })

          // Reset registerdata when not polling
          if (!currentState.clientState.polling) useDataZustand.getState().setRegisterData([])
        }),
      setType: (type) =>
        set((state) => {
          const currentState = get()
          if (!currentState.ready) return

          state.registerConfig.type = type
          window.api.updateRegisterConfig({ type })

          // Reset registerdata when not polling
          if (!currentState.clientState.polling) useDataZustand.getState().setRegisterData([])
        }),
      setLittleEndian: (littleEndian) =>
        set((state) => {
          if (!get().ready) return
          state.registerConfig.littleEndian = littleEndian
          window.api.updateRegisterConfig({ littleEndian })
        }),
      setReadConfiguration: (readConfiguration) =>
        set((state) => {
          if (!get().ready) return
          state.registerConfig.readConfiguration = readConfiguration
          window.api.updateRegisterConfig({ readConfiguration })
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
      setVersion: (version) =>
        set((state) => {
          state.version = version
        })
    })),
    {
      name: `root.zustand`,
      partialize: (state) => ({
        connectionConfig: state.connectionConfig,
        registerConfig: state.registerConfig,
        registerMapping: state.registerMapping
      })
    }
  )
)

const state = useRootZustand.getState()

// Clear when state is corrupted
const clear = () => {
  useRootZustand.persist.clearStorage()
  useRootZustand.setState(useRootZustand.getInitialState())
}

const stateResult = PersistedRootZustandSchema.safeParse(state)
if (!stateResult.success) {
  console.log(stateResult.error)
  clear()
}

// Sync the main process state with the front end
state.init()

//
//
//
//
// Listen to events to set the state

// Client state, like polling, scanning, etc.
onEvent('client_state', (clientState) => {
  const state = useRootZustand.getState()
  state.setClientState(clientState)
})

// Transactions from the transation log
onEvent('transaction', (transaction) => {
  const state = useRootZustand.getState()
  state.addTransaction(transaction)
})

// Unit ID scanning results
onEvent('scan_unit_id_result', (scanUnitIDResult) => {
  const state = useRootZustand.getState()
  state.addScanUnitIdResult(scanUnitIDResult)
})

// Scan progress
onEvent('scan_progress', (scanProgress) => {
  const state = useRootZustand.getState()
  state.setScanProgress(scanProgress)
})

//
//
// Stop scanning when reloaded, shouldn't be a problem with the build app,
// but just in case and for development, stop scanning when the frontend is reloaded
window.api.stopScanningUnitIds()

window.api.getAppVersion().then((version) => {
  state.setVersion(version)
})
