import ModbusRTU from 'modbus-serial'
import { AppState } from '../state'
import {
  AddressGroup,
  BackendMessage,
  BaseDataType,
  ClientState,
  convertBitData,
  convertRegisterData,
  createRegisters,
  groupAddressInfos,
  humanizeSerialError,
  RawTransaction,
  RegisterData,
  RegisterType,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  Transaction,
  Windows,
  WriteParameters
} from '@shared'
import { WriteCoilResult, WriteMultipleResult, WriteRegisterResult } from 'modbus-serial/ModbusRTU'
import round from 'lodash/round'
import { DateTime } from 'luxon'
import { v4 } from 'uuid'

type TryReadFn = (type: RegisterType, address: number, length: number) => Promise<RegisterData[]>

type ScanUnitIdFn = ({
  id,
  address,
  length,
  registerTypes
}: Omit<ScanUnitIDParameters, 'range' | 'timeout'> & { id: number }) => Promise<void>

export interface ClientParams {
  appState: AppState
  windows: Windows
}

export class ModbusClient {
  private _client: ModbusRTU
  private _appState: AppState
  private _windows: Windows

  private _clientState: ClientState = {
    connectState: 'disconnected',
    polling: false,
    scanningUniId: false,
    scanningRegisters: false
  }

  private _pollTimeout: NodeJS.Timeout | undefined
  private _totalScans = 1
  private _scansDone = 1

  private _reconnectTimeout: NodeJS.Timeout | undefined
  private _shouldAutoReconnect = true
  private _reconnectDelay = 3000 // ms
  private _consecutiveReconnects = 0
  private _maxConsecutiveReconnects = 5
  private _reconnectResetTimeout: NodeJS.Timeout | undefined

  private _deliberateDisconnect = false

  constructor({ appState, windows }: ClientParams) {
    this._client = new ModbusRTU()
    this._appState = appState
    this._windows = windows

    this._client
      .on('error', (error) => {
        this._clientState.connectState = 'disconnected'
        this._sendClientState()
        this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
      })
      .on('close', () => {
        // If we were connected, go to 'connecting' and try to reconnect
        if (this._shouldAutoReconnect) {
          // Only emit reconnecting message if not already in connecting state
          if (!this._reconnectTimeout) {
            this._emitMessage({
              message: `Connection lost, reconnecting (${this._consecutiveReconnects + 1}/${this._maxConsecutiveReconnects})...`,
              variant: 'warning',
              error: null
            })
          }
          this._clientState.connectState = 'connecting'
          this._sendClientState()
          this._scheduleReconnect()
        } else {
          this._clientState.connectState = 'disconnected'
          this._sendClientState()
          if (!this._deliberateDisconnect) {
            this._emitMessage({
              message: 'Connection closed unexpectedly',
              variant: 'error',
              error: null
            })
          } else {
            this._deliberateDisconnect = false
          }
        }
      })
  }

  // Events
  private _emitMessage = (message: BackendMessage): void => {
    this._windows.send('backend_message', message)
  }
  private _sendClientState = (): void => {
    this._windows.send('client_state', this._clientState)
  }
  private _sendData = (data: RegisterData[]): void => {
    this._windows.send('register_data', data)
  }
  private _sendTransaction = (transaction: Transaction): void => {
    this._windows.send('transaction', transaction)
  }
  private _sendUnitIdResult = (result: ScanUnitIDResult): void => {
    this._windows.send('scan_unit_id_result', result)
  }

  private _sendGroups = (groups: AddressGroup[]): void => {
    this._windows.send('address_groups', groups)
  }

  private _sendScanProgress = async (): Promise<void> => {
    this._scansDone++
    const progress = round((this._scansDone / this._totalScans) * 100, 2)
    this._windows.send('scan_progress', progress)
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  //
  //
  // Utils
  private _setConnected = (): void => {
    this._clientState.connectState = 'connected'
    this._sendClientState()
  }
  private _setDisconnected = (): void => {
    this._clientState.connectState = 'disconnected'
    this.stopPolling()
    this._sendClientState()
  }

  //
  //
  // Connect
  // --- Auto-reconnect logic ---
  private _reconnectTriggered = false
  private _scheduleReconnect = (): void => {
    this._consecutiveReconnects++

    if (this._consecutiveReconnects >= this._maxConsecutiveReconnects) {
      this._shouldAutoReconnect = false
      this._emitMessage({
        message: 'Too many consecutive reconnect attempts, giving up',
        variant: 'error',
        error: null
      })
      this._setDisconnected()
      return
    }

    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTriggered = true
      this.connect()
    }, this._reconnectDelay)
  }

  // --- Override connect/disconnect to manage auto-reconnect ---
  public connect = async (): Promise<void> => {
    this._shouldAutoReconnect = true
    if (!this._reconnectTriggered) this._consecutiveReconnects = 0
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = undefined
    this._clientState.connectState = 'connecting'
    this._sendClientState()

    const { protocol, tcp, rtu, unitId } = this._appState.connectionConfig
    const { host, options: tcpOptions } = tcp
    const { com, options: rtuOptions } = rtu

    if (this._client.isOpen) {
      this._emitMessage({ message: 'Already connected', variant: 'warning', error: null })
      this._setConnected()
      this._reconnectTriggered = false
      return
    }

    this._client.setTimeout(3000)
    this._client.setID(unitId)

    // Enables storing transaction requests and responses for logging purposes
    this._client['isDebugEnabled'] = true

    // Connect
    rtuOptions['autoOpen'] = true

    try {
      protocol === 'ModbusTcp'
        ? await this._client.connectTCP(host, tcpOptions)
        : await this._client.connectRTUBuffered(com, {
            baudRate: Number(rtuOptions.baudRate),
            dataBits: rtuOptions.dataBits,
            stopBits: rtuOptions.stopBits,
            parity: rtuOptions.parity
          })
      if (this._reconnectTriggered) {
        this._emitMessage({
          message: `Reconnected to server`,
          variant: 'success',
          error: null
        })
      } else {
        this._emitMessage({
          message: 'Connected to server',
          variant: 'success',
          error: null
        })
      }

      if (this._reconnectResetTimeout) clearTimeout(this._reconnectResetTimeout)
      this._reconnectResetTimeout = setTimeout(() => {
        this._consecutiveReconnects = 0
      }, 10000)
      this._setConnected()
    } catch (error) {
      const port = protocol === 'ModbusRtu' ? com : undefined
      this._emitMessage({
        message: humanizeSerialError(error as Error, port),
        variant: 'error',
        error
      })
      this._setDisconnected()
    }

    this._reconnectTriggered = false
  }

  //
  //
  // Disconnect
  private _disconnectTimeout: NodeJS.Timeout | undefined
  public disconnect = async (): Promise<void> => {
    this._shouldAutoReconnect = false
    this._consecutiveReconnects = 0
    if (this._reconnectResetTimeout) clearTimeout(this._reconnectResetTimeout)
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)

    const wasConnecting = this._clientState.connectState === 'connecting'

    this._clientState.connectState = 'disconnecting'
    this._sendClientState()
    if (!this._client.isOpen) {
      if (!wasConnecting) {
        this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      }
      this._client.destroy(() => {})
      this._setDisconnected()
      return
    }

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
        message: 'Disconnected from server',
        variant: 'default',
        error: null
      })
      this._deliberateDisconnect = true
      this._setDisconnected()
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })

      // ? Don't know what to do here, I think when there's an error we are not connected anymore
      this._setDisconnected()
    }
  }

  public read = async (): Promise<void> => {
    if (this._clientState.polling) {
      this._emitMessage({ message: 'Already polling', variant: 'warning', error: null })
      return
    }

    await this._read()
  }

  private _read = async (): Promise<void> => {
    if (this._clientState.connectState !== 'connected' || !this._client.isOpen) {
      this._emitMessage({
        message: 'Cannot read, not connected',
        variant: 'warning',
        error: null
      })
      this._setDisconnected()
    }

    // Set unit id before reading (in case of TCP)
    const { unitId } = this._appState.connectionConfig
    this._client.setID(unitId)
    this._client.setTimeout(this._appState.registerConfig.timeout)

    let errorMessage: string | undefined
    const data: RegisterData[] = []

    const { type, address, length } = this._appState.registerConfig

    const groups = this._appState.registerConfig.readConfiguration
      ? groupAddressInfos(this._appState.registerMapping?.[type])
      : ([[address, length]] as AddressGroup[])

    for (const [a, l] of groups) {
      try {
        data.push(...(await this._tryRead(type, a, l)))
      } catch (error) {
        const readError = error as Error
        errorMessage = readError.message
        this._emitMessage({
          message: `${errorMessage} [addr:${a}, len:${l}]`,
          variant: 'error',
          error
        })
      }
      this._logTransaction(errorMessage)
      if (this._clientState.connectState !== 'connected') break
    }

    if (data.length > 0) {
      // Send the groups so we can slice the utf8 string correctly.
      this._sendGroups(groups)
      this._sendData(data)
    }
  }

  //
  //
  //
  //
  // Log Transaction
  private _logTransaction = (errorMessage: string | undefined): void => {
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
      request: Array.from(rawTransaction.request)
        .map((b) => Number(b).toString(16).toUpperCase().padStart(2, '0'))
        .join(' '),
      responses: Array.from(rawTransaction.responses).map((response) =>
        Array.from(response as Buffer)
          .map((byte) => Number(byte).toString(16).toUpperCase().padStart(2, '0'))
          .join(' ')
      ),
      errorMessage
    }

    this._sendTransaction(transaction)
  }

  //
  //
  //
  //
  // Polling
  public startPolling = (): void => {
    clearTimeout(this._pollTimeout)
    this._clientState.polling = true
    this._sendClientState()
    this._poll()
  }

  public stopPolling = (): void => {
    clearTimeout(this._pollTimeout)
    this._clientState.polling = false
    this._sendClientState()
  }

  private _poll = async (): Promise<void> => {
    clearTimeout(this._pollTimeout)
    if (!this._clientState.polling) return
    await this._read()
    this._pollTimeout = setTimeout(this._poll, this._appState.registerConfig.pollRate)
  }

  //
  //
  // Reading
  private _tryRead: TryReadFn = async (type, address, length) => {
    let data: RegisterData[] = []

    switch (type) {
      case 'coils':
        data = await this._readCoils(address, length)
        break
      case 'discrete_inputs':
        data = await this._readDiscreteInputs(address, length)
        break
      case 'input_registers':
        data = await this._readInputRegisters(address, length)
        break
      case 'holding_registers':
        data = await this._readHoldingRegisters(address, length)
        break
    }

    return data
  }

  private _readCoils = async (address: number, length: number): Promise<RegisterData[]> => {
    const result = await this._client.readCoils(address, length)
    return convertBitData(
      result,
      address,
      this._appState.registerConfig.length,
      this._clientState.scanningRegisters
    )
  }

  private _readDiscreteInputs = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readDiscreteInputs(address, length)
    return convertBitData(
      result,
      address,
      this._appState.registerConfig.length,
      this._clientState.scanningRegisters
    )
  }

  private _readInputRegisters = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readInputRegisters(address, length)
    return convertRegisterData(
      result,
      address,
      this._appState.registerConfig.littleEndian,
      this._clientState.scanningRegisters
    )
  }

  private _readHoldingRegisters = async (
    address: number,
    length: number
  ): Promise<RegisterData[]> => {
    const result = await this._client.readHoldingRegisters(address, length)
    return convertRegisterData(
      result,
      address,
      this._appState.registerConfig.littleEndian,
      this._clientState.scanningRegisters
    )
  }

  //
  //
  //
  //
  // Write
  public write = async (writeParameters: WriteParameters): Promise<void> => {
    const { address, type, value, dataType, single } = writeParameters

    let errorMessage: string | undefined

    switch (type) {
      case 'coils':
        errorMessage = await this._writeCoil(address, value, single)
        break
      case 'holding_registers':
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
    dataType: BaseDataType,
    single: boolean
  ): Promise<string | undefined> => {
    const { littleEndian } = this._appState.registerConfig

    if (single && !['int16', 'uint16'].includes(dataType)) {
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
  public scanUnitIds = async (params: ScanUnitIDParameters): Promise<void> => {
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

  public stopScanningUnitIds = (): void => {
    // Set scanning unit id to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningUniId = false
  }

  private _scanUnitIds: ScanUnitIdFn = async ({ address, id, length, registerTypes }) => {
    this._client.setID(id)

    const result: ScanUnitIDResult = {
      id,
      registerTypes: [],
      requestedRegisterTypes: registerTypes,
      errorMessage: {
        coils: '',
        discrete_inputs: '',
        input_registers: '',
        holding_registers: ''
      }
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    if (registerTypes.includes('coils')) {
      // Coils
      try {
        await this._client.readCoils(address, length)
        result.registerTypes.push('coils')
      } catch (error) {
        result.errorMessage['coils'] = (error as Error).message
      }
      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Discrete Inputs
    if (registerTypes.includes('discrete_inputs')) {
      try {
        await this._client.readDiscreteInputs(address, length)
        result.registerTypes.push('discrete_inputs')
      } catch (error) {
        result.errorMessage['discrete_inputs'] = (error as Error).message
      }
      await this._sendScanProgress()
    }
    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Input Registers
    if (registerTypes.includes('holding_registers')) {
      try {
        await this._client.readHoldingRegisters(address, length)
        result.registerTypes.push('holding_registers')
      } catch (error) {
        result.errorMessage['holding_registers'] = (error as Error).message
      }
      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUniId) {
      this._sendClientState()
      return
    }

    // Holding Registers
    if (registerTypes.includes('input_registers')) {
      try {
        await this._client.readInputRegisters(address, length)
        result.registerTypes.push('input_registers')
      } catch (error) {
        result.errorMessage['input_registers'] = (error as Error).message
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
  public scanRegisters = async (params: ScanRegistersParameters): Promise<void> => {
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

  private _scanRegister = async (address: number, length: number): Promise<void> => {
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
      ['coils', 'discrete_inputs'].includes(type) ? d.bit : d.hex !== '0000'
    )
    this._sendData(data)
  }

  public stopScanningRegisters = (): void => {
    // Set scanning registers to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningRegisters = false
  }

  // Serial port discovery
  public listSerialPorts = async (): Promise<{ path: string; manufacturer?: string }[]> => {
    try {
      const ports = await ModbusRTU.getPorts()
      return ports.map((p) => ({
        path: p.path,
        manufacturer: p.manufacturer ?? undefined
      }))
    } catch (error) {
      const message = humanizeSerialError(error as Error)
      this._emitMessage({ message, variant: 'error', error })
      return []
    }
  }

  public validateSerialPort = async (
    portPath: string
  ): Promise<{ valid: boolean; message: string }> => {
    try {
      const ports = await ModbusRTU.getPorts()
      const found = ports.some((p) => p.path.toLowerCase() === portPath.toLowerCase())
      return {
        valid: found,
        message: found
          ? `Port "${portPath}" is available`
          : `Port "${portPath}" was not found in available ports`
      }
    } catch (error) {
      const message = humanizeSerialError(error as Error, portPath)
      this._emitMessage({ message, variant: 'error', error })
      return { valid: false, message }
    }
  }

  get state(): ClientState {
    return this._clientState
  }
}
