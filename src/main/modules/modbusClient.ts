import { AppState } from '../state'
import {
  AddressGroup,
  BackendMessage,
  BaseDataType,
  ClientState,
  ConnectState,
  clientOwner,
  convertBitData,
  configuredReadGroups,
  convertRegisterData,
  createRegisters,
  defaultClientState,
  isBooleanRegister,
  maxReadQuantity,
  readLoopOwner,
  RegisterData,
  registersFrom,
  transportKey,
  RegisterType,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  WriteParameters
} from '@shared'
import { Windows } from '../windows'
import * as serialPorts from './modbusClient/serialPorts'
import { errorText, isModbusException } from './modbusClient/errors'
import { RequestTarget, Transport, TransportClient } from './modbusClient/transport'
import { Transports } from './modbusClient/transports'
import {
  NodeStyleCallback,
  ReadCoilResult,
  ReadRegisterResult,
  WriteCoilResult,
  WriteMultipleResult,
  WriteRegisterResult
} from 'modbus-serial/ModbusRTU'
import round from 'lodash/round'

type ReadRegisters = (
  transport: Transport,
  target: RequestTarget,
  address: number,
  length: number
) => Promise<RegisterData[]>

type ScanUnitIdFn = ({
  id,
  address,
  length,
  registerTypes,
  timeout,
  transport
}: Omit<ScanUnitIDParameters, 'range'> & { id: number; transport: Transport }) => Promise<void>

/**
 * What a write did with the port.
 *
 * A write refused before it goes out files no transaction and has nothing to
 * read back, so refused and written are two answers rather than one.
 */
type WriteAttempt = { sent: boolean }

interface ClientParams {
  appState: AppState
  windows: Windows
  transports: Transports
}

export class ModbusClient implements TransportClient {
  private _appState: AppState
  private _windows: Windows
  private _transports: Transports

  /**
   * The connection this client rides, or rode last.
   *
   * Kept after a disconnect rather than cleared, so a read still in flight
   * meets a closed port and fails the way it did on the client's own port.
   * `_connectedTransport` is the question every request asks first.
   */
  private _transport: Transport | undefined

  private _clientState: ClientState = { ...defaultClientState }

  private _pollTimeout: NodeJS.Timeout | undefined
  private _pollGeneration = 0
  private _totalScans = 1
  private _scansDone = 1

  private _reconnectWasPolling = false
  private _reconnectResumePollingTimeout: NodeJS.Timeout | undefined

  constructor({ appState, windows, transports }: ClientParams) {
    this._appState = appState
    this._windows = windows
    this._transports = transports
  }

  // Events
  /**
   * Every client event goes to the main window, the only window that draws the
   * client view.
   *
   * Both windows load the same renderer, so the split out server window holds
   * `client.zustand` too, frozen at what it loaded, and persist writes the
   * whole partialized state on every `setState`. One write there put a read
   * length of 10 over the 7 the main window had just stored, and the next
   * launch read 10.
   */
  private _emitMessage = (message: BackendMessage): void => {
    this._windows.send('backend_message', message, 'main')
  }
  private _sendClientState = (): void => {
    this._windows.send('client_state', this._clientState, 'main')
  }
  private _sendData = (data: RegisterData[]): void => {
    this._windows.send('register_data', data, 'main')
  }
  private _sendUnitIdResult = (result: ScanUnitIDResult): void => {
    this._windows.send('scan_unit_id_result', result, 'main')
  }

  private _sendGroups = (groups: AddressGroup[]): void => {
    this._windows.send('address_groups', groups, 'main')
  }

  /**
   * Counts one step of a scan, and says how far it has got at most every
   * 100 ms, and on the last step.
   *
   * A step is one device request, and a scan can take thousands. Sending each
   * one costs an IPC message and a store write in the renderer, and the bar
   * cannot show a step of a thousandth anyway. Nothing here waits, so a scan
   * runs as fast as the device answers.
   */
  private _scanProgressSentAt = 0
  private _countScanStep = (): void => {
    this._scansDone++
    const now = Date.now()
    const last = this._scansDone >= this._totalScans
    if (!last && now - this._scanProgressSentAt < 100) return
    this._scanProgressSentAt = now
    const progress = round((this._scansDone / this._totalScans) * 100, 2)
    this._windows.send('scan_progress', progress, 'main')
  }

  //
  //
  // Utils
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
   * The transport, when it is open under a connected state, with the message a
   * caller that finds it shut gets.
   *
   * Three callers ask it, `_read`, `write` and either scan, and the state they
   * find is one to correct rather than to report around: `connected` over a
   * closed port leaves the view reading connected until something says
   * otherwise, and `_setDisconnected` is what says it.
   *
   * A poll's own read is the one caller with nobody to answer, and it is the
   * one that passes `quiet`: the close that ended it has already spoken.
   */
  private _connectedTransport = (verb: string, quiet = false): Transport | undefined => {
    const transport = this._transport
    if (this._clientState.connectState === 'connected' && transport?.isOpen) return transport
    if (!quiet) {
      this._emitMessage({
        message: `Cannot ${verb}, not connected`,
        variant: 'warning',
        error: null
      })
    }
    this._setDisconnected()
    return undefined
  }

  /**
   * Whether `verb` may go ahead, saying who has the client when it may not.
   *
   * The transport's queue keeps two requests off the wire at once; this keeps
   * one client from running two things at once. A poll started during a write
   * would read between the write and its read back, and the rows of both would
   * reach the grid in whatever order the queue served them. A control being
   * greyed is not this guard: both windows load the same renderer and every
   * channel reaches here, so the refusal is main's.
   */
  private _requireClient = (verb: string, exceptPolling = false): boolean => {
    const owner = clientOwner(this._clientState, { exceptPolling })
    if (!owner) return true

    this._emitMessage({
      message: `Cannot ${verb} during ${owner}`,
      variant: 'warning',
      error: null
    })
    return false
  }

  //
  //
  // What the transport tells this client
  public setConnectState = (connectState: ConnectState): void => {
    this._clientState.connectState = connectState
    this._sendClientState()
  }

  /**
   * The connection is gone for this client, so everything it runs on it ends,
   * and so does the poll a reconnect would have resumed.
   */
  public transportClosed = (from: Transport): void => {
    if (from !== this._transport) return
    this._reconnectWasPolling = false
    clearTimeout(this._reconnectResumePollingTimeout)
    this._setDisconnected()
  }

  /** Remember whether a poll ran, so the reconnect can resume it. */
  public connectionLost = (): void => {
    this._reconnectWasPolling = this._clientState.polling
    this._clientState.connectState = 'connecting'
    this._sendClientState()
  }

  /**
   * Resume polling, and stay quiet about a second nobody was watching.
   *
   * The user can press Read in the second between the reconnect and this, and
   * `startPolling` would then warn about a poll they did not ask for and drop
   * the resume on the floor. `clientOwner` is the same question
   * `_requireClient` asks, and leaving the memory set is what gives the next
   * reconnect something to resume.
   */
  public reconnected = (): void => {
    clearTimeout(this._reconnectResumePollingTimeout)
    this._reconnectResumePollingTimeout = setTimeout(() => {
      if (!this._reconnectWasPolling) return
      if (clientOwner(this._clientState)) return
      this._reconnectWasPolling = false
      this.startPolling()
    }, 1000)
  }

  //
  //
  // Connect
  /**
   * Ride the transport this client's connection config names, opening it when
   * nothing rides it yet.
   */
  public connect = async (): Promise<void> => {
    const { connectionConfig } = this._appState
    // A client rides one connection. A client still connected on another one
    // keeps it, as it did when it held its own port. An `error` no close
    // followed leaves a disconnected client on the one before, holding that
    // port and hearing its reconnects, so that one is let go of first.
    const previous = this._transport
    const leaving =
      previous?.rides(this) && previous.key !== transportKey(connectionConfig)
        ? previous
        : undefined
    const { connectState } = this._clientState
    if (leaving && connectState !== 'disconnected') {
      const message = connectState === 'connected' ? 'Already connected' : `Still ${connectState}`
      this._emitMessage({ message, variant: 'warning', error: null })
      return
    }
    // A refused connect leaves the client on the transport it rode, so the
    // question comes before it lets go of that one.
    const transport = this._transports.acquire(connectionConfig)
    if (transport.refuses()) return
    // `release` closes the port it rode in the background and tells nobody, so
    // the question above and the join in `attach` run in one turn and the
    // answer is still true when it joins.
    leaving?.release(this)
    this._transport = transport
    await transport.attach(this, connectionConfig)
  }

  //
  //
  // Disconnect
  public disconnect = async (): Promise<void> => {
    const wasConnecting = this._clientState.connectState === 'connecting'
    this._clientState.connectState = 'disconnecting'
    this._sendClientState()

    const transport = this._transport
    if (!transport) {
      this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      this._setDisconnected()
      return
    }
    await transport.detach(this, wasConnecting)
  }

  /**
   * One read, and nothing else of this client's until it has answered.
   *
   * `_read` puts one request per group on the queue and waits for each, so two
   * of them running at once interleave their groups and send the grid two
   * answers. `clientOwner` is who holds the client, and a read in flight is
   * one of the five: `_readOwningTheClient`
   * puts that state out before the first request and takes it back after the
   * last, and the caller that finds it set is refused the way a caller during a
   * poll is. The loops do not go through here, so a poll blocks a read without
   * a read ever blocking a poll.
   */
  public read = async (): Promise<void> => {
    if (!this._requireClient('read')) return

    await this._readOwningTheClient()
  }

  /**
   * `_read`, with `reading` around it.
   *
   * `read` asks whether it may and this does the owning, because a write reads
   * back what it wrote and that read is the write's rather than a caller's: it
   * passed the question once already, and asking again during its own write
   * would refuse it.
   */
  private _readOwningTheClient = async (): Promise<void> => {
    this._clientState.reading = true
    this._sendClientState()
    try {
      await this._read()
    } finally {
      this._clientState.reading = false
      this._sendClientState()
    }
  }

  /**
   * One read of the toolbar's block or of the configured groups, sent as one
   * `register_data`.
   *
   * `pollGeneration` is the chain a poll's read belongs to. A stopped poll
   * lets go after the request it has on the wire, and neither sends nor says
   * anything about it: the rows
   * would land in whatever the stop made room for, which is a scan's result
   * list or the grid of a chain that started since, and the groups it had
   * left would go out between that chain's own on the queue.
   */
  private _read = async (pollGeneration?: number): Promise<void> => {
    const transport = this._connectedTransport('read', this._clientState.polling)
    if (!transport) return
    const stopped = (): boolean =>
      pollGeneration !== undefined && pollGeneration !== this._pollGeneration

    // What this read is addressed to, taken before the first request goes out.
    const readGeneration = this._appState.readGeneration
    const target: RequestTarget = {
      unitId: this._appState.connectionConfig.unitId,
      timeout: this._appState.registerConfig.timeout
    }

    const data: RegisterData[] = []

    const { type, address, length } = this._appState.registerConfig

    // Read configuration groups by data type, and a bit type carries none.
    // `configuredReadGroups` is that question, in `@shared` because the
    // renderer asks it too: `clearRegisterDataWhenIdle` draws the mapping and
    // asks for a read, and an empty answer here is the toolbar's group coming
    // back instead of what it drew.
    const configGroups = configuredReadGroups(
      this._appState.readConfiguration,
      type,
      this._appState.registerMapping
    )
    // The toolbar's group is bounded by neither ceiling. `RegisterConfigSchema`
    // takes a length of 65535 at any address, so a persisted store carries a
    // read past the last register there is; and the type and the length are two
    // channels, so main holds the old length for one round trip when the type
    // changes under it, which is how 2000 coils became 2000 holding registers.
    //
    // A configured group is left whole on purpose. Its length is the data
    // type's width, so cutting it reads part of a value: an int64 at 65534 came
    // back as 2 registers, and `convertRegisterData` answers 0 to a 64 bit type
    // it has not got the registers for. Refused, the address gets an error row
    // instead, which is the truth about a mapping that runs off the end.
    const toolbarGroup: AddressGroup = [
      address,
      Math.min(length, maxReadQuantity([type]), registersFrom(address))
    ]
    const groups = configGroups.length > 0 ? configGroups : [toolbarGroup]

    for (const [groupIndex, [groupAddress, groupLength]] of groups.entries()) {
      if (stopped()) return
      try {
        const rows = await this._readers[type](transport, target, groupAddress, groupLength)
        rows.forEach((row) => {
          row.groupIndex = groupIndex
        })
        data.push(...rows)
      } catch (error) {
        const errorMessage = errorText(error)

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
        } else if (!stopped()) {
          this._emitMessage({
            message: `${errorMessage} [addr:${groupAddress}, len:${groupLength}, id:${this._appState.connectionConfig.unitId}]`,
            variant: 'error',
            error
          })
        }
      }
      if (this._clientState.connectState !== 'connected') break
    }

    // A reply describes the unit id, type, address and length the requests
    // went out under, and carries none of them. `register_data` replaces the
    // grid with what arrives, and `clearRegisterDataWhenIdle` has emptied it or
    // drawn the new mapping by then, so the old unit's values would land in the
    // rows drawn for the new one. The renderer cannot tell the two apart: only
    // main knows what its read asked. The transport logged the transactions
    // above either way, because they happened.
    if (this._appState.readGeneration !== readGeneration) return
    if (stopped()) return

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
  // Polling
  /**
   * Start a poll chain, unless one is already running.
   *
   * A chain is a read, a wait, and the next read, so a second chain is a second
   * read of the same registers in every round. Both callers can arrive while a read is in flight:
   * `start_polling` passes on whatever the renderer sends, and the reconnect
   * resume fires a second after the connect that scheduled it.
   */
  public startPolling = (): void => {
    if (this._clientState.polling) return
    if (!this._requireClient('poll')) return

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
    await this._read(generation)
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
   * four functions and reads only whether the call threw. Each request waits
   * its turn on the transport, which logs it.
   */
  private _readers: Record<RegisterType, ReadRegisters> = {
    coils: async (transport, target, address, length) =>
      this._toBits(
        await transport.request(target, (modbus) => modbus.readCoils(address, length)),
        address,
        length
      ),
    discrete_inputs: async (transport, target, address, length) =>
      this._toBits(
        await transport.request(target, (modbus) => modbus.readDiscreteInputs(address, length)),
        address,
        length
      ),
    input_registers: async (transport, target, address, length) =>
      this._toRegisters(
        await transport.request(target, (modbus) => modbus.readInputRegisters(address, length)),
        address
      ),
    holding_registers: async (transport, target, address, length) =>
      this._toRegisters(
        await transport.request(target, (modbus) => modbus.readHoldingRegisters(address, length)),
        address
      )
  }

  /**
   * One row per bit that was asked for.
   *
   * The length is the read's own, not `registerConfig.length`. modbus-serial
   * answers a bit read with eight booleans per byte, so a read of three comes
   * back as eight and the row count has to come from the request. Even the
   * toolbar's own group is not `registerConfig.length` any more: it is that
   * length under both read ceilings, so 2000 coils asked for at 65500 is a
   * group of 36.
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
    // `writeFC5`, `writeFC6`, `writeFC15` and `writeFC16` answer a closed port
    // with a `PortNotOpenError` before they file a transaction, so a write down
    // a closed port has nothing of its own to log.
    const transport = this._connectedTransport('write')
    if (!transport) return

    if (!this._requireClient('write')) return

    const { address, type, value, dataType, single } = writeParameters

    // The timeout the user set, the way `_read` does it. A write that took
    // whatever ran last on the connection got a register scan's 100 ms, or the
    // 3000 ms an open sets, rather than the 1000 ms the toolbar's own floor
    // promises.
    const target: RequestTarget = {
      unitId: this._appState.connectionConfig.unitId,
      timeout: this._appState.registerConfig.timeout
    }

    this._clientState.writing = true
    this._sendClientState()
    try {
      let attempt: WriteAttempt

      switch (type) {
        case 'coils':
          attempt = await this._writeCoil(transport, target, address, value, single)
          break
        case 'holding_registers':
          attempt = await this._writeRegister(transport, target, address, value, dataType, single)
          break
      }

      // A refused write has nothing to read back: every `sent: false` below
      // emitted its own warning and put no request on the wire, so the device
      // holds what it held.
      if (!attempt.sent) return

      // Read back what the device now holds, unless a loop started during the
      // write and is reading anyway. `reading` is not in that question: this
      // write owns the client, so nothing else can have set it.
      if (!readLoopOwner(this._clientState)) await this._readOwningTheClient()
    } finally {
      this._clientState.writing = false
      this._sendClientState()
    }
  }

  /**
   * A `writeFCx` as a promise.
   *
   * `ModbusRTU.d.ts` gives FC5, FC6, FC15 and FC16 one signature apart from the
   * value: unit id, data address, the value, and a `NodeStyleCallback`. One
   * conversion rather than one per code, where the four copies differ in the
   * method name, the type argument and the value they pass. The caller hands
   * over a call with the callback still open, so the `ModbusRTU` stays bound
   * and the method and its arguments stay where the reader is.
   */
  private _awaitWrite = <R>(write: (next: NodeStyleCallback<R>) => void): Promise<R> =>
    new Promise<R>((resolve, reject) =>
      write((error, data) => {
        if (error) {
          reject(error)
          return
        }
        resolve(data)
      })
    )

  private _writeCoil = async (
    transport: Transport,
    target: RequestTarget,
    address: number,
    value: boolean[],
    single: boolean
  ): Promise<WriteAttempt> => {
    // The schema accepts an empty list, and neither function code can carry
    // one. FC5 writes the first coil, which would be `undefined` on the wire.
    // FC15 writes `array.length` into the frame as the quantity of coils, so
    // an empty list asks a device to write none.
    const [first] = value
    if (first === undefined) {
      this._emitMessage({
        message: 'No coil value to write',
        variant: 'warning',
        error: undefined
      })
      return { sent: false }
    }

    try {
      await transport.request<unknown>(target, (modbus) =>
        single
          ? this._awaitWrite<WriteCoilResult>((next) =>
              modbus.writeFC5(target.unitId, address, first, next)
            )
          : this._awaitWrite<WriteMultipleResult>((next) =>
              modbus.writeFC15(target.unitId, address, value, next)
            )
      )
    } catch (error) {
      this._emitMessage({ message: errorText(error), variant: 'error', error })
    }
    return { sent: true }
  }

  private _writeRegister = async (
    transport: Transport,
    target: RequestTarget,
    address: number,
    value: number,
    dataType: BaseDataType,
    single: boolean
  ): Promise<WriteAttempt> => {
    const { littleEndian } = this._appState.registerConfig

    if (single && !['int16', 'uint16'].includes(dataType)) {
      this._emitMessage({
        message: 'Single register only supported for 16 bit values',
        variant: 'warning',
        error: undefined
      })
      return { sent: false }
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
      return { sent: false }
    }

    const registers = createRegisters(dataType, value, littleEndian)

    try {
      await transport.request<unknown>(target, (modbus) =>
        single
          ? this._awaitWrite<WriteRegisterResult>((next) =>
              modbus.writeFC6(target.unitId, address, registers[0], next)
            )
          : this._awaitWrite<WriteMultipleResult>((next) =>
              modbus.writeFC16(target.unitId, address, registers, next)
            )
      )
    } catch (error) {
      this._emitMessage({ message: errorText(error), variant: 'error', error: error })
    }
    return { sent: true }
  }

  //
  //
  // Scanning
  //
  // Polling and scanning are two read loops over one client, so starting a scan
  // stops the poll. That is a consequence of scanning rather than something the
  // user asked for, so it is taken here and neither dialog does it.
  //
  // Scan Unit ID
  public scanUnitIds = async (params: ScanUnitIDParameters): Promise<void> => {
    const transport = this._connectedTransport('scan')
    if (!transport) return
    if (!this._requireClient('scan', true)) return
    this.stopPolling()

    this._clientState.scanningUnitIds = true
    this._sendClientState()

    const { range } = params

    this._totalScans = (range[1] - range[0] + 1) * params.registerTypes.length
    this._scansDone = 0
    this._scanProgressSentAt = 0

    for (let id = range[0]; id <= range[1]; id++) {
      await this._scanUnitIds({ id, transport, ...params })
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

  private _scanUnitIds: ScanUnitIdFn = async ({
    address,
    id,
    length,
    registerTypes,
    timeout,
    transport
  }) => {
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
        await this._readers[registerType](transport, { unitId: id, timeout }, address, length)
        result.registerTypes.push(registerType)
      } catch (error) {
        result.errorMessage[registerType] = errorText(error)
        if (isModbusException(error)) result.refusedRegisterTypes.push(registerType)
      }

      this._countScanStep()
    }

    if (!this._clientState.scanningUnitIds) {
      this._sendClientState()
      return
    }

    this._sendUnitIdResult(result)
  }

  //
  //
  //
  //
  // Scan Registers
  public scanRegisters = async (params: ScanRegistersParameters): Promise<void> => {
    const transport = this._connectedTransport('scan')
    if (!transport) return
    if (!this._requireClient('scan', true)) return
    this.stopPolling()

    const target: RequestTarget = {
      unitId: this._appState.connectionConfig.unitId,
      timeout: params.timeout
    }

    // The chunk is the stride, the divisor of the progress and the quantity of
    // every request, so it is one number here. `ScanRegistersParametersSchema`
    // takes any positive chunk size, and `ChunkSizeField`'s mask reads the
    // register type selected, so a chunk of 2000 typed under coils reaches this
    // with holding registers selected.
    const { addressRange } = params
    const length = Math.min(params.length, maxReadQuantity([this._appState.registerConfig.type]))

    this._totalScans = Math.ceil((addressRange[1] - addressRange[0] + 1) / length)
    this._scansDone = 0
    this._scanProgressSentAt = 0

    this._clientState.scanningRegisters = true
    this._sendClientState()

    for (let address = addressRange[0]; address <= addressRange[1]; address += length) {
      await this._scanRegister(transport, target, address, length)
      this._countScanStep()
      if (!this._clientState.scanningRegisters) break
      if (this._clientState.connectState !== 'connected') break
    }

    this._clientState.scanningRegisters = false
    this._sendClientState()
  }

  private _scanRegister = async (
    transport: Transport,
    target: RequestTarget,
    address: number,
    length: number
  ): Promise<void> => {
    const type = this._appState.registerConfig.type
    // The last chunk alone, so the stride its caller walks is untouched. What
    // one response carries is clamped there, where the same number is the
    // stride and the progress divisor.
    length = Math.min(length, registersFrom(address))

    let data: RegisterData[] | undefined

    try {
      data = await this._readers[type](transport, target, address, length)
    } catch (error) {
      this._emitMessage({ message: errorText(error), variant: 'error', error })
    }

    if (!data) return
    data = data.filter((row) => (isBooleanRegister(type) ? row.bit : row.hex !== '0000'))
    this._sendData(data)
  }

  public stopScanningRegisters = (): void => {
    // Set scanning registers to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningRegisters = false
  }

  /** The serial ports this machine has, for the two RTU COM fields. */
  public listSerialPorts = (): Promise<{ path: string; manufacturer?: string }[]> =>
    serialPorts.listSerialPorts(this._emitMessage)

  /** Whether a path is one of the ports this machine has. */
  public validateSerialPort = (portPath: string): Promise<{ valid: boolean; message: string }> =>
    serialPorts.validateSerialPort(portPath, this._emitMessage)

  get state(): ClientState {
    return this._clientState
  }
}
