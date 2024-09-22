import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { RootZusand } from './root.zustand.types'
import {
  ClientState,
  ConnectState,
  defaultConnectionConfig,
  defaultRegisterConfig,
  IpcEvent,
  RegisterData,
  RegisterType,
  ScanUnitIDResult,
  Transaction
} from '@shared'
import { DateTime } from 'luxon'

export const useRootZustand = create<RootZusand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    // Register data
    registerData: [],
    setRegisterData: (data) =>
      set((state) => {
        state.registerData = data
      }),
    appendRegisterData: (data) =>
      set((state) => {
        console.log(data)
        state.registerData.push(...data)
      }),
    // Connection state
    // Register mapping
    registerMapping: {
      [RegisterType.Coils]: {},
      [RegisterType.DiscreteInputs]: {},
      [RegisterType.HoldingRegisters]: {},
      [RegisterType.InputRegisters]: {}
    },
    setRegisterMapping: (register, key, value) => {
      const type = getState().registerConfig.type

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
          [RegisterType.Coils]: {},
          [RegisterType.DiscreteInputs]: {},
          [RegisterType.HoldingRegisters]: {},
          [RegisterType.InputRegisters]: {}
        }
      }),
    // Transaction log
    transactions: [],
    addTransaction: (transaction) =>
      set((state) => {
        state.transactions.unshift(transaction)
      }),
    clearTransactions: () =>
      set((state) => {
        state.transactions = []
      }),

    // Config
    init: async () => {
      const syncedConnectionConfig = await window.api.getConnectionConfig()
      const syncedRegisterConfig = await window.api.getRegisterConfig()
      const clientState = await window.api.getClientState()

      set((state) => {
        state.connectionConfig = syncedConnectionConfig
        state.registerConfig = syncedRegisterConfig
        state.clientState = clientState
        state.ready = true
      })
    },
    connectionConfig: defaultConnectionConfig,
    registerConfig: defaultRegisterConfig,

    // State
    clientState: {
      connectState: ConnectState.Disconnected,
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
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        state.connectionConfig.protocol = protocol
        window.api.updateConnectionConfig({ protocol })
      }),
    //
    //
    // TCP
    setPort: (port) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        const newPort = Number(port)
        state.connectionConfig.tcp.options.port = newPort
        window.api.updateConnectionConfig({ tcp: { options: { port: newPort } } })
      }),
    setHost: (host, valid) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

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
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        state.valid.com = !!valid
        state.connectionConfig.rtu.com = com
        if (!valid) return
        window.api.updateConnectionConfig({ rtu: { com } })
      }),
    setBaudRate: (baudRate) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        const newBaudRate = Number(baudRate)
        state.connectionConfig.rtu.options.baudRate = newBaudRate
        window.api.updateConnectionConfig({ rtu: { options: { baudRate: newBaudRate } } })
      }),
    setParity: (parity) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        state.connectionConfig.rtu.options.parity = parity
        window.api.updateConnectionConfig({ rtu: { options: { parity } } })
      }),
    setDataBits: (dataBits) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        const newDataBits = Number(dataBits)
        state.connectionConfig.rtu.options.dataBits = newDataBits
        window.api.updateConnectionConfig({ rtu: { options: { dataBits: newDataBits } } })
      }),
    setStopBits: (stopBits) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return
        if (currentState.clientState.connectState !== ConnectState.Disconnected) return

        const newStopBits = Number(stopBits)
        state.connectionConfig.rtu.options.stopBits = newStopBits
        window.api.updateConnectionConfig({ rtu: { options: { stopBits: newStopBits } } })
      }),
    //
    //
    // Layout configuration settings
    setAddressBase: (addressBase) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.addressBase = addressBase
        window.api.updateRegisterConfig({ addressBase })
      }),
    setShow64BitValues: (show64BitValues) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.show64BitValues = show64BitValues
        window.api.updateRegisterConfig({ show64BitValues })
      }),
    setAdvancedMode: (advancedMode) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.advancedMode = advancedMode
        window.api.updateRegisterConfig({ advancedMode })
      }),
    // Addressing
    setUnitId: (unitId) =>
      set((state) => {
        if (!getState().ready) return
        const newUnitId = Number(unitId)
        state.connectionConfig.unitId = newUnitId
        window.api.updateConnectionConfig({ unitId: newUnitId })
      }),
    setAddress: (address) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return

        const newAddress = Number(address)
        state.registerConfig.address = newAddress
        window.api.updateRegisterConfig({ address: newAddress })

        // Reset registerdata when not polling
        if (!currentState.clientState.polling) state.registerData = []
      }),
    setLength: (length, valid) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return

        state.valid.lenght = !!valid
        const newLength = Number(length)
        state.registerConfig.length = Number(length)
        if (!valid) return
        window.api.updateRegisterConfig({ length: newLength })

        // Reset registerdata when not polling
        if (!currentState.clientState.polling) state.registerData = []
      }),
    setType: (type) =>
      set((state) => {
        const currentState = getState()
        if (!currentState.ready) return

        state.registerConfig.type = type
        window.api.updateRegisterConfig({ type })

        // Reset registerdata when not polling
        if (!currentState.clientState.polling) state.registerData = []
      }),
    setLittleEndian: (littleEndian) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.littleEndian = littleEndian
        window.api.updateRegisterConfig({ littleEndian })
      }),
    // Reading
    setPollRate: (pollRate) =>
      set((state) => {
        if (!getState().ready) return

        if (pollRate % 1000 !== 0 || pollRate < 1000 || pollRate > 10000) {
          console.error('Invalid poll rate. Must be a multiple of 1000 and between 1000 and 10000.')
          return
        }

        state.registerConfig.pollRate = pollRate
        window.api.updateRegisterConfig({ pollRate })
      }),
    setTimeout: (timeout) =>
      set((state) => {
        if (!getState().ready) return

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
    addScanUnitIdResult: (scanUnitIDResult: ScanUnitIDResult) =>
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
      })
  }))
)

// Sync the main process state with the front end
useRootZustand.getState().init()

//
//
//
//
// Listen to events to set the state

// Client state, like polling, scanning, etc.
window.electron.ipcRenderer.on(IpcEvent.ClientState, (_, clientState: ClientState) => {
  const state = useRootZustand.getState()
  state.setClientState(clientState)
})

// Data read from the registers
window.electron.ipcRenderer.on(IpcEvent.RegisterData, (_, registerData: RegisterData[]) => {
  const state = useRootZustand.getState()
  state.clientState.scanningRegisters
    ? state.appendRegisterData(registerData)
    : state.setRegisterData(registerData)
  state.setLastSuccessfulTransactionMillis(DateTime.now().toMillis())
})

// Transactions from the transation log
window.electron.ipcRenderer.on(IpcEvent.Transaction, (_, transaction: Transaction) => {
  const state = useRootZustand.getState()
  state.addTransaction(transaction)
})

// Unit ID scanning results
window.electron.ipcRenderer.on(
  IpcEvent.ScanUnitIDResult,
  (_, scanUnitIDResult: ScanUnitIDResult) => {
    const state = useRootZustand.getState()
    state.addScanUnitIdResult(scanUnitIDResult)
  }
)

// Scan progress
window.electron.ipcRenderer.on(IpcEvent.ScanProgress, (_, scanProgress: number) => {
  const state = useRootZustand.getState()
  state.setScanProgress(scanProgress)
})

//
//
// Stop scanning when reloaded, shouldn't be a problem with the build app,
// but just in case and for development, stop scanning when the frontend is reloaded
window.api.stopScanningUnitIds()
