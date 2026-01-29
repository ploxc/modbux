import ModbusRTU from 'modbus-serial'
import { AppState } from '../state'
import {
  AddressGroup,
  BackendMessage,
  BaseDataType,
  bigEndian32,
  bigEndian64,
  ClientState,
  createRegisters,
  DataType,
  littleEndian32,
  littleEndian64,
  RawTransaction,
  RegisterData,
  RegisterMapValue,
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
import { Windows } from '@shared'

type BuildAddrInfosFn = (
  items: [string, RegisterMapValue][]
) => Array<{ address: number; registerCount: number; groupEnd: boolean }>

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
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })
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
      ? this.groupAddressInfos()
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
  // Create adress ranges from register config
  /**
   * Determine how many Modbus registers to read for a given DataType.
   * For Utf8, if `nextAddress` is provided we read up to that gap;
   * otherwise we fall back to a safe default of 32 registers.
   */
  private getRegisterLength = (
    dataType: DataType,
    currentAddress: number,
    nextAddress?: number
  ): number => {
    const DEFAULT_UTF8_REGISTERS = 24

    switch (dataType) {
      case 'int16':
      case 'uint16':
        return 1

      case 'float':
      case 'int32':
      case 'uint32':
      case 'datetime':
      case 'unix':
        return 2

      case 'int64':
      case 'uint64':
      case 'double':
        return 4

      case 'utf8':
        if (typeof nextAddress === 'number' && nextAddress > currentAddress) {
          // only use the real gap if it's no larger than DEFAULT_UTF8_REGISTERS
          const gap = nextAddress - currentAddress
          return Math.min(gap, DEFAULT_UTF8_REGISTERS)
        }
        // fallback for when we don't know the next address or it's not helpful
        return DEFAULT_UTF8_REGISTERS

      default:
        return 0
    }
  }

  /**
   * Build AddrInfo entries including correct registerCount.
   */
  private buildAddrInfos: BuildAddrInfosFn = (items) => {
    return items
      .map((item, idx, arr) => {
        const dataType = item[1].dataType
        if (!dataType || dataType === 'none') return undefined

        const address = Number(item[0])

        const next = arr[idx + 1]
        const nextAddress = next?.[0] ? Number(next[0]) : undefined
        const registerCount = this.getRegisterLength(dataType, address, nextAddress)

        return {
          address,
          registerCount,
          groupEnd: !!item[1].groupEnd
        }
      })
      .filter((i) => i !== undefined)
  }

  /**
   * Group a list of AddrInfo items into minimal continuous Modbus read blocks.
   * If the last item in a block is type 'utf8', we over-read by `margin`.
   *
   * @param infos     - sorted array of { address, registerCount, type }
   * @param maxLength - maximum registers per read (default 125)
   * @param margin    - extra registers to include when last type is utf8 (default 0)
   * @returns         - array of [startAddress, count]
   */
  private groupAddressInfos = (maxLength: number = 100): Array<AddressGroup> => {
    const registers = this._appState.registerMapping?.[this._appState.registerConfig.type]
    if (!registers) return []

    const isRegisterEntry = (
      tup: [string, RegisterMapValue | undefined]
    ): tup is [string, RegisterMapValue] => {
      return tup[1] !== undefined
    }

    const registerEntries = Object.entries(registers)
      .filter(isRegisterEntry)
      .filter((entry) => entry[1].dataType !== undefined && entry[1].dataType !== 'none')

    const infos = this.buildAddrInfos(registerEntries)

    // 1) Make a shallow copy and sort by address ascending
    const sorted = infos.slice().sort((a, b) => (a.address ?? 0) - (b.address ?? 0))

    const groups: Array<AddressGroup> = []
    let i = 0 // index of the first ungrouped item

    // 2) Continue until we have grouped all items
    while (i < sorted.length) {
      // This block starts at the current item's address
      const startAddr = sorted[i].address
      // Initial endAddr is the last register used by this item
      let endAddr = startAddr + sorted[i].registerCount - 1
      // j will scan forward to see how many items we can pack
      let j = i

      // 3) Try to include as many following entries as still fit under maxLength
      while (j + 1 < sorted.length) {
        // Check if current item is marked as group end - if so, stop here
        if (sorted[j].groupEnd) {
          break
        }

        const next = sorted.at(j + 1)
        if (!next) break

        const nextEnd = next.address + next.registerCount - 1
        const candidateEnd = Math.max(endAddr, nextEnd)
        const span = candidateEnd - startAddr + 1

        if (span <= maxLength) {
          endAddr = candidateEnd
          j++
        } else {
          break
        }
      }

      // 4) Compute final count = total registers from startAddr to endAddr (inclusive)
      const count = endAddr - startAddr + 1

      // 5) Record this block
      groups.push([startAddr, count])

      // 6) Advance i past all items we just grouped
      i = j + 1
    }

    return groups
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
  private _convertRegisterData = (result: ReadRegisterResult, address: number): RegisterData[] => {
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
          unix: buf32
            ? DateTime.fromMillis(buf32.readUInt32BE(0) * 1000).toFormat('yyyy/MM/dd HH:mm:ss')
            : '',

          // 64 bits
          int64: buf64 ? buf64.readBigInt64BE(0) : BigInt(0),
          uint64: buf64 ? buf64.readBigUInt64BE(0) : BigInt(0),
          double: buf64 ? round(buf64.readDoubleBE(0), 10) : 0,
          datetime: buf64 ? this._parseIEC870DateTime(buf64) : '',
          // Replace null values with spaces
          utf8: buffer ? Buffer.from(buffer.map((b) => (b === 0 ? 32 : b))).toString('utf-8') : ''
        },
        bit: false,
        isScanned: this._clientState.scanningRegisters
      }

      registerData.push(rowData)
    }

    return registerData
  }

  private _convertBitData = (result: ReadCoilResult, address: number): RegisterData[] => {
    const { length } = this._appState.registerConfig
    const { data } = result

    const registerData: RegisterData[] = []

    for (let i = 0; i < length; i++) {
      const bit = data[i] ?? false
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

  private _parseIEC870DateTime = (buf: Buffer): string => {
    if (buf.length !== 8) return ''

    const word1 = buf.readUInt16BE(0)
    const word2 = buf.readUInt16BE(2)
    const word3 = buf.readUInt16BE(4)
    const word4 = buf.readUInt16BE(6)

    if (word1 === 0xffff && word2 === 0xffff && word3 === 0xffff && word4 === 0xffff) {
      return ''
    }

    const year = (word1 & 0b1111111) + 2000
    const day = word2 & 0b11111
    const month = (word2 >> 8) & 0b1111
    const minute = word3 & 0b111111
    const hour = (word3 >> 8) & 0b11111
    const totalMs = word4
    const second = Math.floor(totalMs / 1000)
    const millisecond = totalMs % 1000
    const isInvalid = (word3 & 0b10000000) !== 0

    if (
      year < 2000 ||
      year > 2127 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31 ||
      hour > 23 ||
      minute > 59 ||
      second > 59 ||
      millisecond > 999 ||
      isInvalid
    ) {
      return ''
    }

    return (
      DateTime.utc(year, month, day, hour, minute, second, millisecond).toFormat(
        'yyyy/MM/dd HH:mm:ss'
      ) ?? ''
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

  get state(): ClientState {
    return this._clientState
  }
}
