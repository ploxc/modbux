import { create } from 'zustand'
import { mutative } from 'zustand-mutative'
import { RootZusand } from './root.zustand.types'
import { defaultConnectionConfig, defaultRegisterConfig } from '@shared'

export const useRootZustand = create<RootZusand, [['zustand/mutative', never]]>(
  mutative((set, getState) => ({
    registerData: [],
    connectionConfig: defaultConnectionConfig,
    registerConfig: defaultRegisterConfig,
    ready: false,
    init: async () => {
      const syncedConnectionConfig = await window.api.getConnectionConfig()
      const syncedRegisterConfig = await window.api.getRegisterConfig()

      console.log('init', syncedConnectionConfig.tcp.host)

      set((state) => {
        state.connectionConfig = syncedConnectionConfig
        state.registerConfig = syncedRegisterConfig
        state.ready = true
      })
    },
    valid: {
      host: true,
      com: true
    },
    //
    //
    // Protocol
    setProtocol: (protocol) =>
      set((state) => {
        if (!getState().ready) return
        state.connectionConfig.protocol = protocol
        window.api.updateConnectionConfig({ protocol })
      }),
    //
    //
    // TCP
    setPort: (port) =>
      set((state) => {
        if (!getState().ready) return
        const newPort = Number(port)
        state.connectionConfig.tcp.options.port = newPort
        window.api.updateConnectionConfig({ tcp: { options: { port: newPort } } })
      }),
    setHost: (host, valid) =>
      set((state) => {
        if (!getState().ready) return
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
        if (!getState().ready) return
        state.valid.com = !!valid
        state.connectionConfig.rtu.com = com
        if (!valid) return
        window.api.updateConnectionConfig({ rtu: { com } })
      }),
    setBaudRate: (baudRate) =>
      set((state) => {
        if (!getState().ready) return
        const newBaudRate = Number(baudRate)
        state.connectionConfig.rtu.options.baudRate = newBaudRate
        window.api.updateConnectionConfig({ rtu: { options: { baudRate: newBaudRate } } })
      }),
    setParity: (parity) =>
      set((state) => {
        if (!getState().ready) return
        state.connectionConfig.rtu.options.parity = parity
        window.api.updateConnectionConfig({ rtu: { options: { parity } } })
      }),
    setDataBits: (dataBits) =>
      set((state) => {
        if (!getState().ready) return
        const newDataBits = Number(dataBits)
        state.connectionConfig.rtu.options.dataBits = newDataBits
        window.api.updateConnectionConfig({ rtu: { options: { dataBits: newDataBits } } })
      }),
    setStopBits: (stopBits) =>
      set((state) => {
        if (!getState().ready) return
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
    setLength: (length) =>
      set((state) => {
        if (!getState().ready) return
        const newLength = Number(length)
        state.registerConfig.length = Number(length)
        window.api.updateRegisterConfig({ length: newLength })
      }),
    setType: (type) =>
      set((state) => {
        if (!getState().ready) return
        state.registerConfig.type = type
        window.api.updateRegisterConfig({ type })
      })
  }))
)

useRootZustand.getState().init()
