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
  PROTOCOL_LABELS,
  RawTransaction,
  RegisterData,
  RegisterType,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  Transaction,
  WriteParameters
} from '@shared'
import { Windows } from '../windows'
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

type ReadRegisters = (address: number, length: number) => Promise<RegisterData[]>

type ScanUnitIdFn = ({
  id,
  address,
  length,
  registerTypes
}: Omit<ScanUnitIDParameters, 'range' | 'timeout'> & { id: number }) => Promise<void>

/**
 * An exception reply rather than silence.
 *
 * modbus-serial hangs `modbusCode` on the error it builds from an exception
 * frame, and nothing else it throws carries one: a timeout is a
 * TransactionTimedOutError, a closed port is a PortNotOpenError. So the code
 * is the whole test, and it separates a unit that refused a request from a
 * unit that was never there.
 */
const isModbusException = (error: unknown): boolean =>
  typeof (error as { modbusCode?: unknown })?.modbusCode === 'number'

/** Modbus frames read the way a protocol analyser prints them. */
const toHexString = (bytes: Uint8Array | undefined): string =>
  bytes === undefined
    ? ''
    : Array.from(bytes)
        .map((byte) => Number(byte).toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')

/**
 * The `removeAllListeners` under a `ModbusRTU`.
 *
 * `index.js` has the class extend `EventEmitter`, and `ModbusRTU.d.ts` declares
 * `on` and nothing else of the emitter, so taking listeners off again needs a
 * type written here. Nothing inside modbus-serial listens on the client object,
 * so what comes off is what this file put on.
 */
interface ModbusRTUEmitter extends ModbusRTU {
  removeAllListeners(): void
}

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
    scanningUnitIds: false,
    scanningRegisters: false
  }

  private _pollTimeout: NodeJS.Timeout | undefined
  private _pollGeneration = 0
  private _totalScans = 1
  private _scansDone = 1

  private _reconnectTimeout: NodeJS.Timeout | undefined
  private _shouldAutoReconnect = true
  private _reconnectDelay = 3000 // ms
  private _consecutiveReconnects = 0
  private _maxConsecutiveReconnects = 5
  private _reconnectResetTimeout: NodeJS.Timeout | undefined
  private _reconnectWasPolling = false
  private _reconnectResumePollingTimeout: NodeJS.Timeout | undefined

  constructor({ appState, windows }: ClientParams) {
    this._client = new ModbusRTU()
    this._appState = appState
    this._windows = windows

    this._attachClientHandlers()
  }

  /**
   * Register the handlers that carry connection errors and auto-reconnect.
   *
   * These live on the `ModbusRTU` object rather than on the port, so a client
   * that gets replaced comes back without them. Every site that assigns
   * `this._client` calls this.
   */
  private _attachClientHandlers = (): void => {
    this._client
      .on('error', (error) => {
        this._clientState.connectState = 'disconnected'
        this._sendClientState()
        this._emitMessage({
          message: (error as Error).message || 'Connection error',
          variant: 'error',
          error: error
        })
      })
      .on('close', () => {
        // If we were connected, go to 'connecting' and try to reconnect
        if (this._shouldAutoReconnect) {
          // Remember polling state before trying to reconnect
          this._reconnectWasPolling = this._clientState.polling

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
          // Every close that gets here is one the app did not ask for.
          // modbus-serial takes its close relay off the port inside `close()`,
          // so the close `disconnect` asks for reaches no handler. Measured on
          // 8.0.25 over TCP, over a socat pty and on an Arduino's USB serial
          // port. The other way out of `disconnect` is the timeout, and that
          // one takes the handlers off itself, for the reason written there.
          this._clientState.connectState = 'disconnected'
          this._sendClientState()
          this._emitMessage({
            message: 'Connection closed unexpectedly',
            variant: 'error',
            error: null
          })
        }
      })
  }

  // Events
  /** The client view never leaves the main window, so its messages go there. */
  private _emitMessage = (message: BackendMessage): void => {
    this._windows.sendTo('main', 'backend_message', message)
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
    // A scan is a read loop like polling is, so it ends here too. The loops
    // break on the connect state as well, so what these two add is the flag
    // reaching the dialogs in the `client_state` reporting the disconnect
    // rather than at the end of the read in flight. They go before
    // `stopPolling`, which sends one.
    this.stopScanningUnitIds()
    this.stopScanningRegisters()
    this.stopPolling()
    this._sendClientState()
  }

  /**
   * The read loop that owns the client, named, or nothing.
   *
   * One request at a time is what this class can promise, and each of the
   * three loops puts one on the wire without asking. Before this, `read`
   * refused a poll and not a scan, and nothing refused a write: the write
   * action cell and the bitmap panel disable on `polling`, which is a button
   * rather than an answer.
   */
  private _readLoopOwner = (): string | undefined => {
    if (this._clientState.polling) return 'a poll'
    if (this._clientState.scanningUnitIds) return 'a unit id scan'
    if (this._clientState.scanningRegisters) return 'a register scan'
    return undefined
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
      this._reconnectWasPolling = false
      clearTimeout(this._reconnectResumePollingTimeout)
      this._setDisconnected()
      return
    }

    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = setTimeout(() => {
      this._reconnectTriggered = true
      this.connect()
    }, this._reconnectDelay)
  }

  /**
   * Which connect the port that opens belongs to.
   *
   * `connect` awaits an open, and `disconnect` runs while it waits: the button
   * is a Cancel for as long as the state is 'connecting'. Without this the
   * cancelled connect resumes and writes 'connected' over the disconnect, on a
   * port the user asked the app to let go of.
   */
  private _connectGeneration = 0

  /**
   * Whether an open is on its way back.
   *
   * One `ModbusRTU` holds one port at a time, and `connect` assigns a new one
   * into that slot on every attempt. A second attempt starting while the first
   * is still opening would put its port where the first one is about to close,
   * so the cancelled attempt would take the live connection down with it. The
   * cancel itself is what opens that window: it ends on 'disconnected', which
   * is a Connect button, while the port it cancelled is still opening.
   */
  private _connectInFlight = false

  // --- Override connect/disconnect to manage auto-reconnect ---
  public connect = async (): Promise<void> => {
    if (this._connectInFlight) {
      this._emitMessage({
        message: 'Still finishing the connect you cancelled',
        variant: 'warning',
        error: null
      })
      return
    }
    const generation = ++this._connectGeneration
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

    this._connectInFlight = true
    try {
      if (protocol === 'ModbusTcp') {
        // A copy, because `connectTCP` writes the client's own timeout into the
        // options object it is handed.
        await this._client.connectTCP(host, { ...tcpOptions })
      } else if (protocol === 'ModbusRtuOverTcp') {
        // Encapsulated RTU: a full RTU frame (with CRC) sent raw over a TCP
        // socket, for serial-to-Ethernet gateways in transparent mode.
        // connectTelnet writes the RTU frame unchanged; connectTcpRTUBuffered
        // would instead rewrap it as MBAP (i.e. plain Modbus TCP), which is
        // not RTU over TCP.
        await this._client.connectTelnet(host, { port: tcpOptions.port })
      } else {
        await this._client.connectRTUBuffered(com, {
          baudRate: Number(rtuOptions.baudRate),
          dataBits: rtuOptions.dataBits,
          stopBits: rtuOptions.stopBits,
          parity: rtuOptions.parity
        })
      }

      if (generation !== this._connectGeneration) {
        // A disconnect ran while this one was opening. `close` is what takes
        // modbus-serial's relay off the port, so the port that just opened
        // goes quiet as well as shut. Awaited, because the next connect opens
        // the same path and a serial port that is still closing refuses it:
        // `_connectInFlight` is cleared in the `finally` below, so what this
        // waits for is what that flag promises.
        await new Promise<void>((resolve) => {
          const giveUp = setTimeout(resolve, 5000)
          this._client.close(() => {
            clearTimeout(giveUp)
            resolve()
          })
        })
        this._reconnectTriggered = false
        return
      }

      if (this._reconnectTriggered) {
        this._emitMessage({
          message: `Reconnected over ${PROTOCOL_LABELS[protocol]}`,
          variant: 'success',
          error: null
        })
        // Resume polling
        clearTimeout(this._reconnectResumePollingTimeout)
        this._reconnectResumePollingTimeout = setTimeout(() => {
          if (this._reconnectWasPolling) this.startPolling()
          this._reconnectWasPolling = false
        }, 1000)
      } else {
        this._emitMessage({
          message: `Connected over ${PROTOCOL_LABELS[protocol]}`,
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
      if (generation !== this._connectGeneration) {
        this._reconnectTriggered = false
        return
      }
      const port = protocol === 'ModbusRtu' ? com : undefined
      this._emitMessage({
        message: humanizeSerialError(error as Error, port),
        variant: 'error',
        error
      })
      this._setDisconnected()
    } finally {
      this._connectInFlight = false
    }

    this._reconnectTriggered = false
  }

  //
  //
  // Disconnect
  private _disconnectTimeout: NodeJS.Timeout | undefined
  public disconnect = async (): Promise<void> => {
    const { protocol } = this._appState.connectionConfig
    this._shouldAutoReconnect = false
    this._connectGeneration++
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
          const abandoned = this._client as ModbusRTUEmitter
          // What `destroy` leaves behind decides what this has to do itself.
          // It destroys a socket, and returns a serial port untouched:
          // `RTUBufferedPort` declares no `destroy`, so `ModbusRTU.destroy`
          // takes the branch that only calls back, keeping the port open and
          // its close relay on it. Taking the listeners off is what stops that
          // port speaking to the client that replaces it, which it would do as
          // a connection lost on a connection that is fine.
          abandoned.removeAllListeners()
          // modbus-serial's `_onError` emits on the client, and `destroy`
          // leaves that relay on a serial port too, so a client with no
          // `error` listener left would take the main process down with an
          // unhandled `error` event the next time that port faults.
          abandoned.on('error', () => {})
          abandoned.destroy(() => {
            const message =
              protocol === 'ModbusRtu'
                ? 'Disconnect timeout, the port may stay open until Modbux closes'
                : 'Disconnect timeout, the connection was dropped'
            this._emitMessage({ message, variant: 'warning', error: null })
            resolve()
            this._client = new ModbusRTU()
            this._attachClientHandlers()
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
      this._setDisconnected()
    } catch (error) {
      this._emitMessage({ message: (error as Error).message, variant: 'error', error: error })

      // ? Don't know what to do here, I think when there's an error we are not connected anymore
      this._setDisconnected()
    }
  }

  public read = async (): Promise<void> => {
    const owner = this._readLoopOwner()
    if (owner) {
      this._emitMessage({ message: `Cannot read during ${owner}`, variant: 'warning', error: null })
      return
    }

    await this._read()
  }

  private _read = async (): Promise<void> => {
    if (this._clientState.connectState !== 'connected' || !this._client.isOpen) {
      if (!this._clientState.polling) {
        this._emitMessage({
          message: 'Cannot read, not connected',
          variant: 'warning',
          error: null
        })
      }
      this._setDisconnected()
      return
    }

    // Set unit id before reading (in case of TCP)
    const { unitId } = this._appState.connectionConfig
    this._client.setID(unitId)
    this._client.setTimeout(this._appState.registerConfig.timeout)

    const data: RegisterData[] = []

    const { type, address, length } = this._appState.registerConfig

    // Read configuration groups by data type, and a bit type carries none: the
    // grid mounts the data type column for input and holding registers alone,
    // so a comment is all it writes into a coil. A config file is another
    // matter, because `RegisterMappingSchema` uses one object schema for all
    // four types, and a data type it puts on a coil address is ignored here the
    // way the toolbar button refuses it.
    const groupable = type === 'input_registers' || type === 'holding_registers'
    const configGroups =
      this._appState.readConfiguration && groupable
        ? groupAddressInfos(this._appState.registerMapping?.[type])
        : []
    const groups = configGroups.length > 0 ? configGroups : ([[address, length]] as AddressGroup[])

    for (const [groupIndex, [groupAddress, groupLength]] of groups.entries()) {
      // Per group: `_logTransaction` below runs whether the group threw or not,
      // so an errorMessage that outlives its group logs a clean group as failed.
      let errorMessage: string | undefined
      try {
        const rows = await this._readers[type](groupAddress, groupLength)
        rows.forEach((row) => {
          row.groupIndex = groupIndex
        })
        data.push(...rows)
      } catch (error) {
        const readError = error as Error
        errorMessage = readError.message

        if (this._appState.readConfiguration) {
          // Generate error placeholder rows for configured addresses in this failed group
          const mapping = this._appState.registerMapping?.[type]
          if (mapping) {
            for (const [addressKey, mapValue] of Object.entries(mapping)) {
              const mappedAddress = Number(addressKey)
              if (
                mappedAddress >= groupAddress &&
                mappedAddress < groupAddress + groupLength &&
                mapValue?.dataType &&
                mapValue.dataType !== 'none'
              ) {
                data.push({
                  id: mappedAddress,
                  buffer: new Uint8Array(2),
                  hex: '0000',
                  words: undefined,
                  bit: false,
                  isScanned: false,
                  error: errorMessage,
                  groupIndex
                })
              }
            }
          }
        } else {
          this._emitMessage({
            message: `${errorMessage} [addr:${groupAddress}, len:${groupLength}, id:${this._appState.connectionConfig.unitId}]`,
            variant: 'error',
            error
          })
        }
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
  //
  // Everything here is read out of modbus-serial's internals, so it is worth
  // writing down what those actually guarantee.
  //
  // A transaction is created by the writeFCx methods and never removed again:
  // the library only ever assigns _transactions in its constructor. Removing
  // them is ours to do, or a session grows one entry per request.
  //
  // request and responses are stashed only while debug mode is on, and only
  // by the write that reaches the port, so a transaction can carry neither.
  // The library checks for them before using them; this used to not, and a
  // scan that met one crashed the handler it ran in.
  //
  // The key is a transaction id on TCP and UDP, and nothing at all on a
  // serial port: RTU has no transaction ids, so every serial transaction is
  // filed under the string "undefined". It is a map key, not a number.
  private _logTransaction = (errorMessage: string | undefined): void => {
    const rawTransactions = Object.entries(this._client['_transactions']) as [
      string,
      RawTransaction
    ][]
    const lastTransaction = rawTransactions.at(-1)
    if (!lastTransaction) return

    const [transactionIdKey, rawTransaction] = lastTransaction

    // Only the entry being logged, so the same one is not logged again on the
    // next call. Emptying the table takes entries for requests still in flight
    // with it, and `_onReceive` drops a response whose entry is gone, so the
    // request times out rather than resolving.
    delete this._client['_transactions'][transactionIdKey]

    const transaction: Transaction = {
      id: `${transactionIdKey}__${v4()}`,
      timestamp: DateTime.now().toMillis(),
      unitId: rawTransaction.nextAddress,
      address: rawTransaction.nextDataAddress,
      code: rawTransaction.nextCode,
      responseLength: rawTransaction.nextLength,
      timeout: rawTransaction._timeoutFired,
      request: toHexString(rawTransaction.request),
      responses: (rawTransaction.responses ?? []).map(toHexString),
      errorMessage
    }

    this._sendTransaction(transaction)
  }

  //
  //
  //
  //
  // Polling
  /**
   * Start a poll chain, unless one is already running.
   *
   * A chain is a read, a wait, and the next read, so a second chain is a second
   * read on one connection. Both callers can arrive while a read is in flight:
   * `start_polling` passes on whatever the renderer sends, and the reconnect
   * resume fires a second after the connect that scheduled it.
   */
  public startPolling = (): void => {
    if (this._clientState.polling) return
    this._clientState.polling = true
    this._sendClientState()
    this._poll(++this._pollGeneration)
  }

  public stopPolling = (): void => {
    clearTimeout(this._pollTimeout)
    this._pollGeneration++
    this._clientState.polling = false
    this._sendClientState()
  }

  /**
   * Read, then arm the next read, as long as this chain is still the current one.
   *
   * `stopPolling` clears the handle a sleeping chain holds, and a chain that is
   * awaiting a read holds none, because `_pollTimeout` is assigned after the
   * await. It takes the generation instead: the read resolves into a number
   * that is no longer current, and the chain ends there rather than arming a
   * timer nothing can clear.
   */
  private _poll = async (generation: number): Promise<void> => {
    await this._read()
    if (generation !== this._pollGeneration) return
    this._pollTimeout = setTimeout(
      () => this._poll(generation),
      this._appState.registerConfig.pollRate
    )
  }

  //
  //
  // Reading
  /**
   * The read each register type asks for, and the rows behind its reply.
   *
   * `_read` and `_scanRegister` take the rows. The unit id scan takes the same
   * four functions and reads only whether the call threw. Each entry reaches
   * `this._client` when it runs rather than closing over it, because a
   * disconnect that times out replaces the client.
   */
  private _readers: Record<RegisterType, ReadRegisters> = {
    coils: async (address, length) =>
      this._toBits(await this._client.readCoils(address, length), address, length),
    discrete_inputs: async (address, length) =>
      this._toBits(await this._client.readDiscreteInputs(address, length), address, length),
    input_registers: async (address, length) =>
      this._toRegisters(await this._client.readInputRegisters(address, length), address),
    holding_registers: async (address, length) =>
      this._toRegisters(await this._client.readHoldingRegisters(address, length), address)
  }

  /**
   * One row per bit that was asked for.
   *
   * The length is the read's own, not `registerConfig.length`. modbus-serial
   * answers a bit read with eight booleans per byte, so a read of three comes
   * back as eight and the row count has to come from the request. The two are
   * one number for a read out of the toolbar, where the only group is
   * `[address, registerConfig.length]`. Every other caller passes its own.
   */
  private _toBits = (result: ReadCoilResult, address: number, length: number): RegisterData[] =>
    convertBitData(result, address, length, this._clientState.scanningRegisters)

  private _toRegisters = (result: ReadRegisterResult, address: number): RegisterData[] =>
    convertRegisterData(
      result,
      address,
      this._appState.registerConfig.littleEndian,
      this._clientState.scanningRegisters
    )

  //
  //
  //
  //
  // Write
  public write = async (writeParameters: WriteParameters): Promise<void> => {
    const owner = this._readLoopOwner()
    if (owner) {
      this._emitMessage({
        message: `Cannot write during ${owner}`,
        variant: 'warning',
        error: null
      })
      return
    }

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

    // Read back what the device now holds, unless a loop started during the
    // write and is reading anyway.
    if (!this._readLoopOwner()) this.read()
  }

  private _writeCoil = async (
    address: number,
    value: boolean[],
    single: boolean
  ): Promise<string | undefined> => {
    const { unitId } = this._appState.connectionConfig

    try {
      if (single) {
        // FC5 writes the first coil of the list, and the schema accepts an
        // empty one, which would put `undefined` on the wire.
        const [first] = value
        if (first === undefined) {
          this._emitMessage({
            message: 'No coil value to write',
            variant: 'warning',
            error: undefined
          })
          return
        }

        // Wrtie single coil
        await new Promise<WriteCoilResult>((resolve, reject) =>
          this._client.writeFC5(unitId, address, first, (err, data) => {
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
        message: 'Single register only supported for 16 bit values',
        variant: 'warning',
        error: undefined
      })
      return
    }

    // The dialog offers UTF-8 in the same list as the numbers, and a string is
    // written from its characters rather than from the value field. Asking
    // `createRegisters` for one wrote a single register of zero over it.
    if (dataType === 'utf8' || dataType === 'none') {
      this._emitMessage({
        message: `Modbux cannot write a value as ${dataType === 'utf8' ? 'UTF-8' : 'NONE'}`,
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
  // Scanning
  //
  // Polling and scanning are two read loops over one port, so starting a scan
  // stops the poll. That is a consequence of scanning rather than something the
  // user asked for, so it is taken here and neither dialog does it.
  /**
   * Whether a scan may start, with the message a refused one gets.
   *
   * A scan does not go through `_read`, so it asks here what `_read` asks
   * before it reads.
   */
  private _canScan = (): boolean => {
    if (this._clientState.connectState === 'connected' && this._client.isOpen) return true
    this._emitMessage({ message: 'Cannot scan, not connected', variant: 'warning', error: null })
    return false
  }

  //
  //
  // Scan Unit ID
  public scanUnitIds = async (params: ScanUnitIDParameters): Promise<void> => {
    if (!this._canScan()) return
    this.stopPolling()

    this._client.setTimeout(params.timeout)
    this._clientState.scanningUnitIds = true
    this._sendClientState()

    const { range } = params

    this._totalScans = (range[1] - range[0] + 1) * params.registerTypes.length
    this._scansDone = 0

    for (let id = range[0]; id <= range[1]; id++) {
      await this._scanUnitIds({ id, ...params })
      if (!this._clientState.scanningUnitIds) break
      if (this._clientState.connectState !== 'connected') break
    }

    this._clientState.scanningUnitIds = false
    this._sendClientState()
  }

  public stopScanningUnitIds = (): void => {
    // Set scanning unit id to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningUnitIds = false
  }

  private _scanUnitIds: ScanUnitIdFn = async ({ address, id, length, registerTypes }) => {
    this._client.setID(id)

    const result: ScanUnitIDResult = {
      id,
      registerTypes: [],
      refusedRegisterTypes: [],
      requestedRegisterTypes: registerTypes,
      errorMessage: {
        coils: '',
        discrete_inputs: '',
        input_registers: '',
        holding_registers: ''
      }
    }

    for (const registerType of registerTypes) {
      if (!this._clientState.scanningUnitIds) {
        this._sendClientState()
        return
      }

      try {
        await this._readers[registerType](address, length)
        result.registerTypes.push(registerType)
      } catch (error) {
        result.errorMessage[registerType] = (error as Error).message
        if (isModbusException(error)) result.refusedRegisterTypes.push(registerType)
      }

      await this._sendScanProgress()
    }

    if (!this._clientState.scanningUnitIds) {
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
    if (!this._canScan()) return
    this.stopPolling()

    const { unitId } = this._appState.connectionConfig
    this._client.setID(unitId)
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
      if (this._clientState.connectState !== 'connected') break
      await new Promise((resolve) => setTimeout(resolve, 5))
    }

    this._clientState.scanningRegisters = false
    this._sendClientState()
  }

  private _scanRegister = async (address: number, length: number): Promise<void> => {
    const type = this._appState.registerConfig.type
    if (address + length > 65536) length = 65536 - address

    let data: RegisterData[] | undefined
    let errorMessage: string | undefined

    try {
      data = await this._readers[type](address, length)
    } catch (error) {
      const readError = error as Error
      errorMessage = readError.message
      this._emitMessage({ message: errorMessage, variant: 'error', error })
    }

    this._logTransaction(errorMessage)

    if (!data) return
    data = data.filter((row) =>
      ['coils', 'discrete_inputs'].includes(type) ? row.bit : row.hex !== '0000'
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
      return ports.map((port) => ({
        path: port.path,
        manufacturer: port.manufacturer ?? undefined
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
      const found = ports.some((port) => port.path.toLowerCase() === portPath.toLowerCase())
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
