import ModbusRTU from 'modbus-serial'
import { AppState } from '../state'
import { BrowserWindow } from 'electron'
import {
  BackendMessage,
  ClientState,
  ConnectState,
  IpcEvent,
  Protocol,
  RegisterData,
  RegisterType
} from '@shared'
import { convertHoldingRegisterData } from './functions'

export interface ClientParams {
  appState: AppState
  mainWindow: BrowserWindow
}

export class ModbusClient {
  private _client: ModbusRTU
  private _appState: AppState
  private _mainWindow: BrowserWindow
  private _clientState: ClientState = {
    connectState: ConnectState.Disconnected,
    polling: false
  }

  private _pollTimeout: NodeJS.Timeout | undefined

  constructor({ appState, mainWindow }: ClientParams) {
    this._client = new ModbusRTU()
    this._appState = appState
    this._mainWindow = mainWindow

    this._client
      .on('error', (error) => {
        this._clientState.connectState = ConnectState.Disconnected
        this._sendClientState()
        this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
      })
      .on('close', () => {
        this._clientState.connectState = ConnectState.Disconnected
        this._sendClientState()
        this._emitMessage({
          message: 'Connection closed',
          variant: 'warning',
          error: null
        })
      })
  }

  // Events
  private _emitMessage = (message: BackendMessage) => {
    this._mainWindow.webContents.send(IpcEvent.BackendMessage, message)
  }
  private _sendClientState = () => {
    this._mainWindow.webContents.send(IpcEvent.ClientState, this._clientState)
  }
  private _sendData = (data: RegisterData[]) => {
    this._mainWindow.webContents.send(IpcEvent.RegisterData, data)
  }

  //
  //
  // Utils
  private _setConnected = () => {
    this._clientState.connectState = ConnectState.Connected
    this._sendClientState()
  }
  private _setDisconnected = () => {
    this._clientState.connectState = ConnectState.Disconnected
    this.stopPolling()
    this._sendClientState()
  }

  //
  //
  // Connect
  public connect = async () => {
    this._clientState.connectState = ConnectState.Connecting
    this._sendClientState()

    const { protocol, tcp, rtu, unitId } = this._appState.connectionConfig
    const { host, options: tcpOptions } = tcp
    const { com, options: rtuOptions } = rtu

    if (this._client.isOpen) {
      this._emitMessage({ message: 'Already connected', variant: 'warning', error: null })
      this._setConnected()
      return
    }

    this._client.setTimeout(3000)
    this._client.setID(unitId)

    // Connect
    const endpoint = protocol === Protocol.ModbusTcp ? `${host}:${tcpOptions.port}` : `${unitId}`
    const message = `Connecting to modbus server/slave: ${endpoint} with ${protocol === Protocol.ModbusTcp ? 'TCP' : 'RTU'} protocol`
    this._emitMessage({ message, variant: 'default', error: null })

    try {
      protocol === Protocol.ModbusTcp
        ? await this._client.connectTCP(host, tcpOptions)
        : await this._client.connectRTU(com, rtuOptions)
      this._emitMessage({ message: 'Connected to server/slave', variant: 'success', error: null })
      this._setConnected()
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
      this._setDisconnected()
    }
  }

  //
  //
  // Disconnect
  public disconnect = async () => {
    this._clientState.connectState = ConnectState.Disconnecting
    this._sendClientState()
    if (!this._client.isOpen) {
      this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      this._setDisconnected()
      return
    }

    const message = 'Disconnecting from modbus server/slave'
    this._emitMessage({ message, variant: 'default', error: null })

    try {
      await new Promise<void>((resolve) => this._client.close(() => resolve()))
      this._emitMessage({
        message: 'Disconnected from server/slave',
        variant: 'success',
        error: null
      })
      this._setDisconnected()
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })

      // ? Don't know what to do here, I think when there's an error we are not connected anymore
      this._setDisconnected()
    }
  }

  public read = async () => {
    if (this._clientState.polling) {
      this._emitMessage({ message: 'Already polling', variant: 'warning', error: null })
      return
    }

    await this._read()
  }

  private _read = async () => {
    if (this._clientState.connectState !== ConnectState.Connected || !this._client.isOpen) {
      this._emitMessage({
        message: 'Cannot read, not connected',
        variant: 'warning',
        error: null
      })
      this._setDisconnected()
      return
    }

    // Set unit id before reading (in case of TCP)
    const { unitId } = this._appState.connectionConfig
    this._client.setID(unitId)
    this._client.setTimeout(this._appState.registerConfig.timeout)

    try {
      await this._tryRead()
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
    }
  }

  //
  //
  // Polling
  public startPolling = () => {
    clearTimeout(this._pollTimeout)
    this._clientState.polling = true
    this._sendClientState()
    this._poll()
  }

  public stopPolling = () => {
    clearTimeout(this._pollTimeout)
    this._clientState.polling = false
    this._sendClientState()
  }

  private _poll = async () => {
    clearTimeout(this._pollTimeout)
    if (!this._clientState.polling) return
    await this._read()
    this._pollTimeout = setTimeout(this._poll, this._appState.registerConfig.pollRate)
  }

  //
  //
  // Reading
  private _tryRead = async () => {
    const { type } = this._appState.registerConfig
    switch (type) {
      case RegisterType.Coils:
        throw new Error('Reading coils not yet implemented')
      case RegisterType.DiscreteInputs:
        throw new Error('Reading discrete inputs not yet implemented')
      case RegisterType.InputRegisters:
        throw new Error('Reading input registers not yet implemented')
      case RegisterType.HoldingRegisters:
        this._readHoldingRegisters()
        break
    }
  }

  private _readHoldingRegisters = async () => {
    const { address, length } = this._appState.registerConfig
    const result = await this._client.readHoldingRegisters(address, length)
    const data = convertHoldingRegisterData(address, result)
    this._sendData(data)
  }

  get state() {
    return this._clientState
  }
}
