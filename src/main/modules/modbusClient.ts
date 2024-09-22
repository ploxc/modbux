import ModbusRTU from 'modbus-serial'
import { AppState } from '../state'
import { BrowserWindow } from 'electron'
import {
  BackendMessage,
  bigEndian32,
  bigEndian64,
  ClientState,
  ConnectState,
  createRegisters,
  DataType,
  IpcEvent,
  littleEndian32,
  littleEndian64,
  Protocol,
  RawTransaction,
  RegisterData,
  RegisterType,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  Transaction,
  WriteParameters
} from '@shared'
import {
  ReadCoilResult,
  ReadRegisterResult,
  WriteCoilResult,
  WriteMultipleResult,
  WriteRegisterResult
} from 'modbus-serial/ModbusRTU'
import round from 'lodash/round'
import { DateTime } from 'luxon'
import { v4 } from 'uuid'

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
    polling: false,
    scanningUniId: false,
    scanningRegisters: false
  }

  private _pollTimeout: NodeJS.Timeout | undefined

  private _totalScans = 1
  private _scansDone = 1

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
  private _sendUnitIdResult = (result: ScanUnitIDResult) => {
    this._mainWindow.webContents.send(IpcEvent.ScanUnitIDResult, result)
  }

  private _sendScanProgress = async () => {
    this._scansDone++
    const progress = round((this._scansDone / this._totalScans) * 100, 2)
    this._mainWindow.webContents.send(IpcEvent.ScanProgress, progress)
    await new Promise((resolve) => setTimeout(resolve, 5))
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

    let errorMessage: string | undefined
    let data: RegisterData[] = []

    const { type, address, length } = this._appState.registerConfig

    try {
      data = await this._tryRead(type, address, length)
    } catch (error) {
      const readError = error as Error
      errorMessage = readError.message
      this._emitMessage({ message: errorMessage, variant: 'error', error })
    }

    this._sendData(data)
    this._logTransaction(errorMessage)
  }

  //
  //
  //
  //
  // Log Transaction
  private _logTransaction = (errorMessage: string | undefined) => {
    // Handle transactions, get the latest transaction from the transactions array
    const rawTransactions = Object.entries(this._client['_transactions']) as [
      string,
      RawTransaction
    ][]
    const lastTransaction = rawTransactions.at(-1)
    if (!lastTransaction) return

    // Clear the transactions so we don't log a transaction twice
    // For example when encountering an error we would log the same last transaction again
    this._client['_transactions'] = {}

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
      responses: rawTransaction.responses,
      errorMessage
    }

    this._sendTransaction(transaction)
  }

  //
  //
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
  private _tryRead = async (
    type: RegisterType,
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    let data: RegisterData[] = []

    switch (type) {
      case RegisterType.Coils:
        data = await this._readCoils(address, length)
        break
      case RegisterType.DiscreteInputs:
        data = await this._readDiscreteInputs(address, length)
        break
      case RegisterType.InputRegisters:
        data = await this._readInputRegisters(address, length)
        break
      case RegisterType.HoldingRegisters:
        data = await this._readHoldingRegisters(address, length)
        break
    }

    return data
  }

  private _readCoils = async (address: number, length: number): Promise<RegisterData[]> => {
    const result = await this._client.readCoils(address, length)
    return this._convertBitData(result, address)
  }

  private _readDiscreteInputs = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readDiscreteInputs(address, length)
    return this._convertBitData(result, address)
  }

  private _readInputRegisters = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readInputRegisters(address, length)
    return this._convertRegisterData(result, address)
  }

  private _readHoldingRegisters = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readHoldingRegisters(address, length)
    return this._convertRegisterData(result, address)
  }

  //
  //
  // Conversion
  private _convertRegisterData = (result: ReadRegisterResult, address: number) => {
    if (!result) return []

    const { littleEndian } = this._appState.registerConfig

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
          float: buf32 ? round(buf32.readFloatBE(0), 5) : 0,

          // 64 bits
          int64: buf64 ? buf64.readBigInt64BE(0) : BigInt(0),
          uint64: buf64 ? buf64.readBigUInt64BE(0) : BigInt(0),
          double: buf64 ? round(buf64.readDoubleBE(0), 10) : 0
        },
        bit: false,
        isScanned: this._clientState.scanningRegisters
      }

      registerData.push(rowData)
    }

    return registerData
  }

  private _convertBitData = (result: ReadCoilResult, address: number) => {
    const { length } = this._appState.registerConfig
    const { data } = result

    const registerData: RegisterData[] = []

    for (let i = 0; i < length; i++) {
      const bit = data[i]
      const rowData: RegisterData = {
        id: address + i,
        buffer: Buffer.from([0]),
        hex: '',
        words: undefined,
        bit,
        isScanned: this._clientState.scanningRegisters
      }

      registerData.push(rowData)
    }

    return registerData
  }

  //
  //
  //
  //
  // Write
  public write = async (writeParameters: WriteParameters) => {
    const { address, type, value, dataType, single } = writeParameters

    let errorMessage: string | undefined

    switch (type) {
      case RegisterType.Coils:
        errorMessage = await this._writeCoil(address, value, single)
        break
      case RegisterType.HoldingRegisters:
        errorMessage = await this._writeRegister(address, value, dataType, single)
        break
    }

    // Log the write transaction.
    this._logTransaction(errorMessage)

    // When specified, perform a read after writing the register.
    if (!this._clientState.polling) this.read()
  }

  private _writeCoil = async (
    address: number,
    value: boolean[],
    single: boolean
  ): Promise<string | undefined> => {
    const { unitId } = this._appState.connectionConfig

    try {
      if (single) {
        // Wrtie single coil
        await new Promise<WriteCoilResult>((resolve, reject) =>
          this._client.writeFC5(unitId, address, value[0], (err, data) => {
            if (err) {
              reject(err)
              return
            }
            resolve(data)
          })
        )
        return
      }
      // Write multiple coils
      await new Promise<WriteMultipleResult>((resolve, reject) =>
        this._client.writeFC15(unitId, address, value, (err, data) => {
          if (err) {
            reject(err)
            return
          }
          resolve(data)
        })
      )
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error })
      return (error as Error).message
    }

    return undefined
  }

  private _writeRegister = async (
    address: number,
    value: number,
    dataType: DataType,
    single: boolean
  ): Promise<string | undefined> => {
    const { littleEndian } = this._appState.registerConfig

    if (single && ![DataType.Int16, DataType.UInt16].includes(dataType)) {
      this._emitMessage({
        message: 'Single register only supported fot 16 bit values',
        variant: 'warning',
        error: undefined
      })
      return
    }

    const { unitId } = this._appState.connectionConfig
    const registers = createRegisters(dataType, value, littleEndian)

    try {
      if (single) {
        // Write single register
        await new Promise<WriteRegisterResult>((resolve, reject) =>
          this._client.writeFC6(unitId, address, registers[0], (err, data) => {
            if (err) {
              reject(err)
              return
            }
            resolve(data)
          })
        )
        return
      }
      // Write multiple registers
      await new Promise<WriteMultipleResult>((resolve, reject) =>
        this._client.writeFC16(unitId, address, registers, (err, data) => {
          if (err) {
            reject(err)
            return
          }
          resolve(data)
        })
      )
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
      return (error as Error).message
    }
    return undefined
  }

  //
  //
  //
  //
  // Scan Unit ID
  public scanUnitIds = async (params: ScanUnitIDParameters) => {
    if (this._clientState.polling) {
      this._emitMessage({
        message: 'Cannot scan while polling is enabled',
        variant: 'warning',
        error: undefined
      })
      return
    }

    this._client.setTimeout(params.timeout)
    this._clientState.scanningUniId = true
    this._sendClientState()

    const { range } = params

    this._totalScans = (range[1] - range[0] + 1) * params.registerTypes.length
    this._scansDone = 0

    for (let id = range[0]; id <= range[1]; id++) await this._scanUnitIds({ id, ...params })

    this._clientState.scanningUniId = false
    this._sendClientState()
  }

  public stopScanningUnitIds = () => {
    // Set scanning unit id to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningUniId = false
  }

  private _scanUnitIds = async ({
    id,
    address,
    length,
    registerTypes
  }: Omit<ScanUnitIDParameters, 'range'> & { id: number }) => {
    this._client.setID(id)

    const result: ScanUnitIDResult = {
      id,
      registerTypes: [],
      requestedRegisterTypes: registerTypes,
      errorMessage: {
        [RegisterType.Coils]: '',
        [RegisterType.DiscreteInputs]: '',
        [RegisterType.InputRegisters]: '',
        [RegisterType.HoldingRegisters]: ''
      }
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    if (registerTypes.includes(RegisterType.Coils)) {
      // Coils
      try {
        await this._client.readCoils(address, length)
        result.registerTypes.push(RegisterType.Coils)
      } catch (error) {
        result.errorMessage[RegisterType.Coils] = (error as Error).message
      }
      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Discrete Inputs
    if (registerTypes.includes(RegisterType.DiscreteInputs)) {
      try {
        await this._client.readDiscreteInputs(address, length)
        result.registerTypes.push(RegisterType.DiscreteInputs)
      } catch (error) {
        result.errorMessage[RegisterType.DiscreteInputs] = (error as Error).message
      }
      await this._sendScanProgress()
    }
    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Input Registers
    if (registerTypes.includes(RegisterType.HoldingRegisters)) {
      try {
        await this._client.readHoldingRegisters(address, length)
        result.registerTypes.push(RegisterType.HoldingRegisters)
      } catch (error) {
        result.errorMessage[RegisterType.HoldingRegisters] = (error as Error).message
      }
      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Holding Registers
    if (registerTypes.includes(RegisterType.InputRegisters)) {
      try {
        await this._client.readInputRegisters(address, length)
        result.registerTypes.push(RegisterType.InputRegisters)
      } catch (error) {
        result.errorMessage[RegisterType.InputRegisters] = (error as Error).message
      }
      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 10))
    this._sendUnitIdResult(result)
  }

  //
  //
  //
  //
  // Scan Registers
  public scanRegisters = async (params: ScanRegistersParameters) => {
    if (this._clientState.polling) {
      this._emitMessage({
        message: 'Cannot scan while polling is enabled',
        variant: 'warning',
        error: undefined
      })
      return
    }

    this._client.setTimeout(params.timeout)

    this._totalScans = Math.ceil(
      (params.addressRange[1] - params.addressRange[0] + 1) / params.length
    )
    this._scansDone = 0

    this._clientState.scanningRegisters = true
    this._sendClientState()

    const { addressRange, length } = params
    for (let address = addressRange[0]; address <= addressRange[1]; address += length) {
      await this._scanRegister(address, length)
      await this._sendScanProgress()
      if (!this._clientState.scanningRegisters) break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    this._clientState.scanningRegisters = false
    this._sendClientState()
  }

  private _scanRegister = async (address: number, length: number) => {
    const type = this._appState.registerConfig.type
    if (address + length > 65535) length = 65535 - address

    let data: RegisterData[] | undefined
    let errorMessage: string | undefined

    try {
      data = await this._tryRead(type, address, length)
    } catch (error) {
      const readError = error as Error
      errorMessage = readError.message
      this._emitMessage({ message: errorMessage, variant: 'error', error })
    }

    this._logTransaction(errorMessage)

    if (!data) return
    data = data.filter((d) =>
      [RegisterType.Coils, RegisterType.DiscreteInputs].includes(type) ? d.bit : d.hex !== '0000'
    )
    this._sendData(data)
  }

  public stopScanningRegisters = () => {
    // Set scanning registers to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningRegisters = false
  }

  get state() {
    return this._clientState
  }
}
