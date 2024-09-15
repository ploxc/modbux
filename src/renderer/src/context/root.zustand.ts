import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { RootZusand } from './root.zustand.types'
import {
  ClientState,
  ConnectState,
  defaultConnectionConfig,
  defaultRegisterConfig,
  IpcEvent,
  RegisterData
} from '@shared'

export const useRootZustand = create<RootZusand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    registerData: [],
    setRegisterData: (data) =>
      set((state) => {
        state.registerData = data
      }),
    connectionConfig: defaultConnectionConfig,
    registerConfig: defaultRegisterConfig,
    clientState: {
      connectState: ConnectState.Disconnected,
      polling: false
    },
    setConnectState: (connectState) =>
      set((state) => {
        state.clientState.connectState = connectState
      }),
    setPolling: (polling) =>
      set((state) => {
        state.clientState.polling = polling
      }),
    ready: false,
    init: async () => {
      const syncedConnectionConfig = await window.api.getConnectionConfig()
      const syncedRegisterConfig = await window.api.getRegisterConfig()
      const clientState = await window.api.getClientState()

      console.log('init', syncedConnectionConfig.tcp.host)

      set((state) => {
        state.connectionConfig = syncedConnectionConfig
        state.registerConfig = syncedRegisterConfig
        state.clientState = clientState
        state.ready = true
      })
    },
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
    // Addressing
    addressBase: '0',
    setAddressBase: (value) =>
      set((state) => {
        state.addressBase = value
      }),
    setUnitId: (unitId) =>
      set((state) => {
        if (!getState().ready) return
        const newUnitId = Number(unitId)
        state.connectionConfig.unitId = newUnitId
        window.api.updateConnectionConfig({ unitId: newUnitId })
      }),
    setAddress: (address) =>
      set((state) => {
        if (!getState().ready) return
        const newAddress = Number(address)
        state.registerConfig.address = newAddress
        window.api.updateRegisterConfig({ address: newAddress })
      }),
    setLength: (length, valid) =>
      set((state) => {
        if (!getState().ready) return
        state.valid.lenght = !!valid
        const newLength = Number(length)
        state.registerConfig.length = Number(length)
        if (!valid) return
        window.api.updateRegisterConfig({ length: newLength })
      }),
    setType: (type) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.type = type
        window.api.updateRegisterConfig({ type })
      }),
    // Reading
    setPollRate: (pollRate) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.pollRate = pollRate
        window.api.updateRegisterConfig({ pollRate })
      }),
    setTimeout: (timeout) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.timeout = timeout
        window.api.updateRegisterConfig({ timeout })
      })
    //
  }))
)

useRootZustand.getState().init()

// Listen to events to set the state
window.electron.ipcRenderer.on(IpcEvent.ClientState, (_, clientState: ClientState) => {
  const state = useRootZustand.getState()
  if (state.clientState.connectState !== clientState.connectState)
    state.setConnectState(clientState.connectState)
  if (state.clientState.polling !== clientState.polling) state.setPolling(clientState.polling)
})

window.electron.ipcRenderer.on(IpcEvent.RegisterData, (_, registerData: RegisterData[]) => {
  const state = useRootZustand.getState()
  state.setRegisterData(registerData)
})
