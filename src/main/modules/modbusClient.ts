import ModbusRTU from 'modbus-serial'
import { AppState } from '../state'
import { BrowserWindow } from 'electron'
import {
  BackendMessage,
  ClientState,
  ConnectState,
  IpcEvent,
  Protocol,
  RawTransaction,
  RegisterData,
  RegisterType,
  Transaction
} from '@shared'
import { ReadCoilResult, ReadRegisterResult } from 'modbus-serial/ModbusRTU'
import round from 'lodash/round'
import { DateTime } from 'luxon'
import { v4 } from 'uuid'

// Regular most significant word first (big endian)
const bigEndian32 = (buffer: Buffer, offset: number) => {
  return buffer.subarray(offset, offset + 4)
}

// Uncommon least significant word first (little endian)
const littleEndian32 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 2, offset + 4),
    buffer.subarray(offset, offset + 2)
  ])
}

// Regular most significant word first (big endian)
const bigEndian64 = (buffer: Buffer, offset: number) => {
  return buffer.subarray(offset, offset + 8)
}

// Uncommon least significant word first (little endian)
const littleEndian64 = (buffer: Buffer, offset: number) => {
  return Buffer.concat([
    buffer.subarray(offset + 6, offset + 8),
    buffer.subarray(offset + 4, offset + 6),
    buffer.subarray(offset + 2, offset + 4),
    buffer.subarray(offset, offset + 2)
  ])
}

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
  private _sendTransaction = (transaction: Transaction) => {
    this._mainWindow.webContents.send(IpcEvent.Transaction, transaction)
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

    // Enables storing transaction requests and responses for logging purposes
    this._client['isDebugEnabled'] = true

    // Connect
    const endpoint = protocol === Protocol.ModbusTcp ? `${host}:${tcpOptions.port}` : `${unitId}`
    const message = `Connecting to modbus server/slave: ${endpoint} with ${protocol === Protocol.ModbusTcp ? 'TCP' : 'RTU'} protocol`
    this._emitMessage({ message, variant: 'default', error: null })

    // Weird, this is included in rtu options, but when autoOpen (not available in type) is false it doesn't work.
    rtuOptions['autoOpen'] = true

    try {
      protocol === Protocol.ModbusTcp
        ? await this._client.connectTCP(host, tcpOptions)
        : await this._client.connectRTUBuffered(com, rtuOptions)
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
  private _disconnectTimeout: NodeJS.Timeout | undefined
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
      await new Promise<void>((resolve) => {
        this._disconnectTimeout = setTimeout(() => {
          this._client.destroy(() => {
            const message = 'Disconnect timeout, client destroyed'
            this._emitMessage({ message, variant: 'warning', error: null })
            resolve()
            this._client = new ModbusRTU()
          })
        }, 5000)

        this._client.close(() => {
          clearTimeout(this._disconnectTimeout)
          resolve()
        })
      })
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

    // Handle transactions, get the latest transaction from the transactions array
    const rawTransactions = Object.entries(this._client['_transactions']) as [
      string,
      RawTransaction
    ][]
    const lastTransaction = rawTransactions.at(-1)
    if (!lastTransaction) return

    const [transactionIdKey, rawTransaction] = lastTransaction

    // Check if transaction has already been processed
    const transactionId = Number(transactionIdKey)

    const transaction: Transaction = {
      id: `${transactionId}__${v4()}`,
      timestamp: DateTime.now().toMillis(),
      unitId: rawTransaction.nextAddress,
      address: rawTransaction.nextDataAddress,
      code: rawTransaction.nextCode,
      responseLength: rawTransaction.nextLength,
      timeout: rawTransaction._timeoutFired,
      request: rawTransaction.request,
      responses: rawTransaction.responses
    }

    this._sendTransaction(transaction)
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
        await this._readCoils()
        break
      case RegisterType.DiscreteInputs:
        await this._readDiscreteInputs()
        break
      case RegisterType.InputRegisters:
        await this._readInputRegisters()
        break
      case RegisterType.HoldingRegisters:
        await this._readHoldingRegisters()
        break
    }
  }

  private _readCoils = async () => {
    const { address, length } = this._appState.registerConfig
    const result = await this._client.readCoils(address, length)
    const data = this._convertBitData(result)
    this._sendData(data)
  }

  private _readDiscreteInputs = async () => {
    const { address, length } = this._appState.registerConfig
    const result = await this._client.readDiscreteInputs(address, length)
    const data = this._convertBitData(result)
    this._sendData(data)
  }

  private _readInputRegisters = async () => {
    const { address, length } = this._appState.registerConfig
    const result = await this._client.readInputRegisters(address, length)
    const data = this._convertRegisterData(result)
    this._sendData(data)
  }

  private _readHoldingRegisters = async () => {
    const { address, length } = this._appState.registerConfig
    // await new Promise<void>((resolve) => {
    //   this._client.writeFC16(10, 120, [1234, 5678], (err, data) => {
    //     console.log(err, data)
    //     resolve()
    //   })
    // })
    const result = await this._client.readHoldingRegisters(address, length)
    const data = this._convertRegisterData(result)
    this._sendData(data)
  }

  //
  //
  // Conversion
  private _convertRegisterData = (result: ReadRegisterResult) => {
    if (!result) return []

    const { address, littleEndian } = this._appState.registerConfig

    const { buffer } = result
    const registerData: RegisterData[] = []

    // A register contains 16 bits, so we handle 2 bytes at a time
    const registers = result.buffer.byteLength / 2

    for (let i = 0; i < registers; i++) {
      const offset = i * 2 // Register (16 bits) = 2 bytes

      // Only read int32, uint32, and float if we have 2 or more registers left
      const inRange32 = i < registers - 1

      // Only read BigInt64 and Double if we have 4 or more registers left
      const inRange64 = i < registers - 3

      // Apply 32 bit endianness
      const buf32 = inRange32
        ? littleEndian
          ? littleEndian32(buffer, offset)
          : bigEndian32(buffer, offset)
        : undefined

      // Apply 64 bit endianness
      const buf64 = inRange64
        ? littleEndian
          ? littleEndian64(buffer, offset)
          : bigEndian64(buffer, offset)
        : undefined

      // Define row data, read big endian data
      const rowData: RegisterData = {
        id: address + i,
        buffer: buffer.subarray(offset, offset + 2),
        hex: buffer.subarray(offset, offset + 2).toString('hex'),
        words: {
          int16: buffer.readInt16BE(offset),
          uint16: buffer.readUInt16BE(offset),

          // 32 bits
          int32: buf32 ? buf32.readInt32BE(0) : 0,
          uint32: buf32 ? buf32.readUInt32BE(0) : 0,
          float: buf32 ? round(buf32.readFloatBE(0), 7) : 0,

          // 64 bits
          int64: buf64 ? buf64.readBigInt64BE(0) : BigInt(0),
          uint64: buf64 ? buf64.readBigUInt64BE(0) : BigInt(0),
          double: buf64 ? round(buf64.readDoubleBE(0), 15) : 0
        },
        bit: false
      }

      registerData.push(rowData)
    }

    return registerData
  }

  private _convertBitData = (result: ReadCoilResult) => {
    const { address, length } = this._appState.registerConfig
    const { data } = result

    const registerData: RegisterData[] = []

    for (let i = 0; i < length; i++) {
      const bit = data[i]
      const rowData: RegisterData = {
        id: address + i,
        buffer: Buffer.from([0]),
        hex: '',
        words: undefined,
        bit
      }

      registerData.push(rowData)
    }

    return registerData
  }

  get state() {
    return this._clientState
  }
}
