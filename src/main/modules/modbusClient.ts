import type ModbusRTU from 'modbus-serial'
import { isDeepStrictEqual } from 'util'
import { AppState } from '../state'
import {
  AddressGroup,
  AddressGroupResult,
  BackendMessage,
  ClientUnit,
  DataType,
  ClientState,
  ClientVisibleSections,
  ConnectionConfig,
  ConnectionSettings,
  ConnectState,
  clientOwner,
  convertBitData,
  configuredReadGroups,
  convertRegisterData,
  DeepPartial,
  createRegisters,
  defaultClientState,
  isBooleanRegister,
  isConfiguredAddress,
  isLoggable,
  isLogged,
  monitorPolledGroups,
  monitorReadsGroup,
  LogPage,
  LogPageQuery,
  LogWindow,
  LogSample,
  LogSeries,
  LogSetting,
  LogStatus,
  loggedValue,
  isReadLengthGiven,
  maxReadQuantity,
  pollDelay,
  readLoopOwner,
  readsNothing,
  RegisterConfig,
  RegisterData,
  registersFrom,
  transportKey,
  RegisterType,
  RegisterTypeSchema,
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  unitIdOutOfRange,
  WriteParameters
} from '@shared'
import { Windows } from '../windows'
import { errorText, isGatewaySilence, isModbusException, isTimeout } from './modbusClient/errors'
import { RequestTarget, Transport, TransportClient } from './modbusClient/transport'
import { Transports } from './modbusClient/transports'
import { SessionLog } from './modbusClient/sessionLog'
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
  length: number,
  littleEndian: boolean
) => Promise<RegisterData[]>

/** Answers whether the scan may go on: no once it was stopped or its ride ended. */
type ScanUnitIdFn = ({
  id,
  address,
  length,
  registerTypes,
  timeout,
  ride,
  scan
}: Omit<ScanUnitIDParameters, 'range'> & {
  id: number
  ride: Ride
  scan: number
}) => Promise<boolean>

/**
 * What a write did with the port.
 *
 * A write refused before it goes out has nothing to read back, and neither
 * does one that failed on a connection that went while it waited. A write the
 * device took, or refused, is read back.
 */
type WriteAttempt = { sent: boolean }

/** One read of a logged register, kept until the read it belongs to is known to count. */
interface PendingSample {
  series: LogSeries
  setting: LogSetting
  time: number
  value: number
  error: string | undefined
}

/** One read a poll round makes: a register type of a unit, as Monitor groups it or not. */
interface RoundRead {
  type: RegisterType
  monitor: boolean
  /** The groups to read, where the read takes fewer than the mapping configures. */
  groups?: AddressGroup[]
}

/** What a request came back with: its result, or the error it failed with. */
type Settled<Result> = { ok: true; result: Result } | { ok: false; error: unknown }

/**
 * The connection a request went out on, taken when it went.
 *
 * `ride` is the client's count of the times it left a connected state, so an
 * equal count means the client has been connected over this transport since
 * the request went out. A different one means the connection is not the one
 * there now, even when the transport, the state and the port read the same
 * again: after a reconnect, or after leaving a shared transport and joining
 * it once more.
 */
interface Ride {
  transport: Transport
  ride: number
}

interface ClientParams {
  uuid: string
  appState: AppState
  windows: Windows
  transports: Transports
  /** The app's connection settings as they are now, which every client shares. */
  connectionSettings: () => ConnectionSettings
}

export class ModbusClient implements TransportClient {
  /** The uuid every event this client sends names it by. */
  readonly uuid: string
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

  /** How often this client has left a connected state. `Ride` says why. */
  private _ride = 0

  /**
   * Which scan is the latest. A scan's tail clears its flag only while it is,
   * because a scan that ended with its connection can finish after a new one
   * started on the next.
   */
  private _scanGeneration = 0

  /**
   * Whether the scan started as `scan` is still the one running: its flag set,
   * and no scan started since. A stopped scan's flag can be set again by the
   * next one before its request settles.
   */
  private _stillScanning = (flag: 'scanningUnitIds' | 'scanningRegisters', scan: number): boolean =>
    this._clientState[flag] && scan === this._scanGeneration

  private _clientState: ClientState = { ...defaultClientState }

  private _pollTimeout: NodeJS.Timeout | undefined
  private _pollGeneration = 0

  /**
   * How many reads in a row each unit has left unanswered, by the unit's uuid.
   * A unit whose unit id changes is another device, and `setUnits` starts it
   * from 0.
   */
  private _silentReads = new Map<string, number>()

  /**
   * How many poll rounds each offline unit sits out before it is read again,
   * by the unit's uuid. `pollDelay` says how long an offline unit waits, and a
   * round is one poll rate long.
   */
  private _roundsToSkip = new Map<string, number>()
  private _totalScans = 1
  private _scansDone = 1

  /** The samples this client took while it logged. */
  private _log = new SessionLog(() =>
    this._emitMessage({
      message: 'The log is full, and overwrites its oldest samples from here on',
      variant: 'warning',
      error: null
    })
  )

  /**
   * Whether the user switched logging on. The log takes samples while this is
   * on and the client polls, so a poll started later starts it too.
   */
  private _logEnabled = false

  constructor({ uuid, appState, windows, transports, connectionSettings }: ClientParams) {
    this.uuid = uuid
    this._appState = appState
    this._windows = windows
    this._transports = transports
    this._connectionSettings = connectionSettings
  }

  private _connectionSettings: () => ConnectionSettings

  /** Whether this client logs, which keeps its connection reconnecting where that is set. */
  public logs = (): boolean => this._logEnabled

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
    this._clientState.log = { ...this._log.status(), enabled: this._logEnabled }
    this._clientState.pollIdle =
      this._clientState.polling &&
      this._appState.units.every((unit) => this._roundReads(unit).length === 0)
    this._windows.send('client_state', { uuid: this.uuid, clientState: this._clientState }, 'main')
  }
  private _sendData = (
    unit: string,
    type: RegisterType,
    registerData: RegisterData[],
    monitor: boolean
  ): void => {
    this._windows.send(
      'register_data',
      { uuid: this.uuid, unit, type, registerData, monitor },
      'main'
    )
  }
  private _sendUnitIdResult = (result: ScanUnitIDResult): void => {
    this._windows.send('scan_unit_id_result', { uuid: this.uuid, result }, 'main')
  }

  private _sendGroups = (
    unit: string,
    type: RegisterType,
    addressGroups: AddressGroup[],
    results: AddressGroupResult[],
    monitor: boolean
  ): void => {
    this._windows.send(
      'address_groups',
      { uuid: this.uuid, unit, type, addressGroups, results, monitor },
      'main'
    )
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
    this._windows.send('scan_progress', { uuid: this.uuid, progress }, 'main')
  }

  //
  //
  // Utils
  /**
   * The one place the connect state changes, which is where a ride ends. A
   * poll goes on through a reconnect and reads nothing until the connection
   * is back, so the log's run ends with the ride, and a new one starts with
   * the next.
   */
  private _enter = (connectState: ConnectState): void => {
    const wasConnected = this._clientState.connectState === 'connected'
    if (wasConnected && connectState !== 'connected') {
      this._ride++
      this._log.stop(Date.now(), 'disconnected')
    }
    if (
      !wasConnected &&
      connectState === 'connected' &&
      this._logEnabled &&
      this._clientState.polling
    )
      this._log.start(Date.now())
    this._clientState.connectState = connectState
  }

  private _setDisconnected = (): void => {
    this._enter('disconnected')
    this._silentReads.clear()
    this._roundsToSkip.clear()
    this._clientState.offlineUnits = []
    // A scan is a read loop like polling is, so it ends here too. The loops
    // end on the ride as well, when their request settles, so what these two
    // add is the flag reaching the dialogs in the `client_state` reporting
    // the disconnect rather than at the end of the read in flight. They go
    // before `stopPolling`, which sends one.
    this.stopScanningUnitIds()
    this.stopScanningRegisters()
    this.stopPolling()
    this._sendClientState()
  }

  /**
   * The transport, when it is open under a connected state, with the message a
   * caller that finds it shut gets.
   *
   * Three callers ask it, `_read`, `write` and either scan. A client is
   * disconnected when it rides no transport, so a no leaves the state to what
   * decides it: an open or a close under way, or what `lost` does with a port
   * found shut. A disconnected client is told so again, which ends a poll or a
   * scan that was started without a connection.
   *
   * A poll's own read is the one caller with nobody to answer, and it is the
   * one that passes `quiet`.
   */
  private _connectedTransport = (verb: string, quiet = false): Transport | undefined => {
    const transport = this._transport
    if (transport && this._clientState.connectState === 'connected' && transport.isOpen) {
      return transport
    }
    // `lost` has said what happened, reconnecting or giving up, so a refusal
    // beside it would say it twice.
    if (transport && this._noticeShut(transport)) return undefined
    if (!quiet) {
      this._emitMessage({
        message: `Cannot ${verb}, not connected`,
        variant: 'warning',
        error: null
      })
    }
    if (this._clientState.connectState === 'disconnected') this._setDisconnected()
    return undefined
  }

  /**
   * Report the client's transport lost when its port is shut under a
   * connected state: `lost` reconnects the transport's clients, or lets them
   * go when the burst has no attempt left. A transport the client has left is
   * not its to report. Answers whether it reported.
   */
  private _noticeShut = (transport: Transport): boolean => {
    if (transport !== this._transport) return false
    if (this._clientState.connectState !== 'connected' || transport.isOpen) return false
    transport.lost()
    return true
  }

  /** The ride a request that goes out now goes out on. */
  private _rideOn = (transport: Transport): Ride => ({ transport, ride: this._ride })

  /** Whether the client has not left the ride since. */
  private _onRide = ({ ride }: Ride): boolean => ride === this._ride

  /** Whether the connection a request went out on is still the one there. */
  private _stillOn = (ride: Ride): boolean => this._onRide(ride) && ride.transport.isOpen

  /** Who a request on `ride` is for, which the transport asks again when its turn comes. */
  private _target = (ride: Ride, unitId: number, timeout: number): RequestTarget => ({
    uuid: this.uuid,
    unitId,
    timeout,
    current: () => this._onRide(ride)
  })

  /**
   * What a request came back with, or undefined when its ride ended while it
   * waited.
   *
   * A request waits its turn on the transport, and by the time it comes back
   * the client may have left that connection, the port may be shut, or a
   * reconnect may have put another connection in its place. What it brings
   * back is then about a connection that is gone rather than the device's
   * answer, so every caller drops it without a row, a result or a message.
   */
  private _settle = async <Result>(
    ride: Ride,
    request: Promise<Result>
  ): Promise<Settled<Result> | undefined> => {
    let settled: Settled<Result>
    try {
      settled = { ok: true, result: await request }
    } catch (error) {
      settled = { ok: false, error }
    }
    if (this._stillOn(ride)) return settled
    this._noticeShut(ride.transport)
    return undefined
  }

  /**
   * Whether a read of `type` on `unit` asks for no registers: a window of
   * length 0, where read configuration has no groups for the type to read
   * instead. `monitor` says whether the read is Monitor's.
   */
  private _readsNothing = (unit: ClientUnit, type: RegisterType, monitor: boolean): boolean =>
    readsNothing(
      this._readsConfiguration(unit, monitor),
      type,
      unit.registerMapping,
      isReadLengthGiven(unit.sections[type].length)
    )

  /**
   * Whether `verb` would ask for no registers, having said so.
   *
   * The length field keeps a 0 rather than refusing it, and main is handed it
   * with the rest of the unit. A read and the read back of a write ask this
   * before they own the client.
   */
  private _refusesLength = (
    verb: string,
    unit: ClientUnit,
    type: RegisterType,
    monitor: boolean
  ): boolean => {
    if (!this._readsNothing(unit, type, monitor)) return false
    this._emitMessage({ message: `Cannot ${verb} a length of 0`, variant: 'warning', error: null })
    return true
  }

  /**
   * Whether `verb` would address a unit id its protocol does not, having said so.
   *
   * A unit keeps such an id rather than refusing it, so every path that puts
   * the id on the wire asks here: a read, a poll's start and its every round, a
   * write and both scans. A unit id scan asks with the highest id it reaches.
   */
  private _refusesUnitId = (verb: string, unitId: number): boolean => {
    const reason = unitIdOutOfRange({ protocol: this._appState.connectionConfig.protocol, unitId })
    if (reason === undefined) return false
    this._emitMessage({
      message: `Cannot ${verb} unit id ${unitId}: ${reason}`,
      variant: 'warning',
      error: null
    })
    return true
  }

  /**
   * The unit a channel names, having said so when there is none.
   *
   * Both windows load the same renderer and every channel reaches here, so a
   * uuid can arrive after its unit was removed.
   */
  private _unitOrSay = (verb: string, uuid: string): ClientUnit | undefined => {
    const unit = this._appState.unit(uuid)
    if (!unit)
      this._emitMessage({
        message: `Cannot ${verb}, no such unit`,
        variant: 'warning',
        error: null
      })
    return unit
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
    this._enter(connectState)
    this._sendClientState()
  }

  /** The connection is gone for this client, so everything it runs on it ends. */
  public transportClosed = (from: Transport): void => {
    if (from !== this._transport) return
    this._setDisconnected()
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
    // A client rides one connection, and a client that rides one is not
    // disconnected, so a connect elsewhere finds it connected or on its way.
    // It keeps what it has, as it did when it held its own port.
    const previous = this._transport
    if (previous?.rides(this) && previous.key !== transportKey(connectionConfig)) {
      const { connectState } = this._clientState
      const message = connectState === 'connected' ? 'Already connected' : `Still ${connectState}`
      this._emitMessage({ message, variant: 'warning', error: null })
      return
    }
    // Asked before `_transport` moves: a refused connect leaves the client on
    // the transport whose close it is still waiting for.
    const transport = this._transports.acquire(connectionConfig)
    if (transport.refuses(this, connectionConfig)) return
    this._transport = transport
    await transport.attach(this, connectionConfig)
  }

  //
  //
  // Disconnect
  /**
   * End everything this client runs, and disconnect it if it rides a
   * connection. What `Clients.delete` calls before it lets go of the client.
   */
  public dispose = async (): Promise<void> => {
    if (this._transport?.rides(this)) {
      await this.disconnect()
      return
    }
    this._setDisconnected()
  }

  public disconnect = async (): Promise<void> => {
    const wasConnecting = this._clientState.connectState === 'connecting'
    this._enter('disconnecting')
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
  public read = async (unit: string, type: RegisterType): Promise<void> => {
    if (!this._requireClient('read')) return
    const found = this._unitOrSay('read', unit)
    if (!found) return

    await this._readOwningTheClient(found, type, false)
  }

  /**
   * `_readSection`, with `reading` around it.
   *
   * `read` is Debug's, in either view: the MCP tools and the undo replay ask
   * it for the section Debug shows. A write's read back is Monitor's while
   * Monitor is on screen, because that is where the write was pressed.
   *
   * `read` asks whether it may and this does the owning, because a write reads
   * back what it wrote and that read is the write's rather than a caller's: it
   * passed the question once already, and asking again during its own write
   * would refuse it.
   */
  private _readOwningTheClient = async (
    unit: ClientUnit,
    type: RegisterType,
    monitor: boolean
  ): Promise<void> => {
    if (
      this._refusesLength('read', unit, type, monitor) ||
      this._refusesUnitId('read', unit.unitId)
    )
      return
    this._clientState.reading = true
    this._sendClientState()
    try {
      this._hear(unit.uuid, await this._readSection(unit, type, monitor))
    } finally {
      this._clientState.reading = false
      this._sendClientState()
    }
  }

  /**
   * One read of a unit's register type, its window or its configured groups,
   * sent as one `register_data` for that unit and type.
   *
   * `pollGeneration` is the chain a poll's read belongs to. A stopped poll
   * lets go after the request it has on the wire, and neither sends nor says
   * anything about it: the rows would land in whatever the stop made room for,
   * which is a scan's result list or the grid of a chain that started since,
   * and the groups it had left would go out between that chain's own on the
   * queue.
   *
   * `onlyGroups` narrows the mapping's groups to the ones a Monitor poll round
   * reads.
   *
   * Answers true when the device answered, false for only silence, and nothing
   * for a read that says neither, which is what `_hear` counts.
   */
  private _readSection = async (
    unit: ClientUnit,
    type: RegisterType,
    monitor: boolean,
    pollGeneration?: number,
    onlyGroups?: AddressGroup[]
  ): Promise<boolean | undefined> => {
    const transport = this._connectedTransport('read', this._clientState.polling)
    if (!transport) return undefined
    const ride = this._rideOn(transport)
    const stopped = (): boolean =>
      pollGeneration !== undefined && pollGeneration !== this._pollGeneration

    // What this read is addressed to, taken before the first request goes out.
    const readGeneration = this._appState.readGeneration(unit.uuid)
    const target = this._target(ride, unit.unitId, this._appState.registerConfig.timeout)
    const readConfiguration = this._readsConfiguration(unit, monitor)

    const data: RegisterData[] = []

    const { address, length } = unit.sections[type]

    // `configuredReadGroups` is in `@shared` because the renderer asks it too:
    // it draws the mapping and asks for a read, and an empty answer here is the
    // window coming back instead of what it drew.
    const configGroups =
      onlyGroups ?? configuredReadGroups(readConfiguration, type, unit.registerMapping)
    // The window is bounded by neither ceiling. `ClientSectionSchema` takes a
    // length of 65535 at any address, so a persisted store carries a read past
    // the last register there is, and 2000 coils is no read of registers.
    //
    // A configured group is left whole on purpose. Its length is the data
    // type's width, so cutting it reads part of a value: an int64 at 65534 came
    // back as 2 registers, and `convertRegisterData` answers 0 to a 64 bit type
    // it has not got the registers for. Refused, the address gets an error row
    // instead, which is the truth about a mapping that runs off the end.
    const window: AddressGroup = [
      address,
      Math.min(length, maxReadQuantity([type]), registersFrom(address))
    ]
    const groups = configGroups.length > 0 ? configGroups : [window]
    let answered = false
    let silent = false

    const results: AddressGroupResult[] = []
    // A poll's grouped read is what a logging client reads, and a read of the
    // grid's window is not.
    const logging = pollGeneration !== undefined && readConfiguration && this._log.running
    const samples: PendingSample[] = []

    for (const [groupIndex, group] of groups.entries()) {
      if (stopped()) return undefined
      const read = await this._readGroup(transport, ride, target, unit, type, group, groupIndex)
      // The connection went while this group waited, so nothing of this read
      // goes anywhere.
      if (!read) return undefined
      if (logging) samples.push(...this._samplesOf(unit, type, read.rows))
      if (read.heard === 'answered') answered = true
      if (read.heard === 'silent') silent = true
      results.push(read.result)
      if (read.result.error === undefined || readConfiguration) {
        data.push(...read.rows)
      } else if (!stopped()) {
        const [groupAddress, groupLength] = group
        this._emitMessage({
          message: `${read.result.error} [addr:${groupAddress}, len:${groupLength}, id:${unit.unitId}]`,
          variant: 'error',
          error: read.error
        })
      }
    }

    // A reply describes the unit id, window and mapping the requests went out
    // under, and carries none of them. `register_data` replaces that unit's
    // grid with what arrives, so the old unit id's values would land in the
    // rows drawn for the new one. The renderer cannot tell the two apart: only
    // main knows what its read asked. The transport logged the transactions
    // above either way, because they happened.
    if (this._appState.readGeneration(unit.uuid) !== readGeneration) return undefined
    if (stopped()) return undefined

    for (const { series, setting, time, value, error } of samples) {
      this._log.record(series, setting, time, value, error)
    }
    if (data.length > 0) {
      // Send the groups so we can slice the utf8 string correctly.
      this._sendGroups(unit.uuid, type, groups, results, monitor)
      this._sendData(unit.uuid, type, data, monitor)
    }
    if (answered) return true
    return silent ? false : undefined
  }

  /**
   * One request for one group, and the rows it leaves: the rows read, or an
   * error row on each configured address of a group that failed. Undefined
   * when the ride ended while the request waited.
   *
   * `heard` is what the request says about the device. An exception is an
   * answer as much as a value is: the device is there. A gateway's 10 or 11 is
   * the gateway answering for a device that is not.
   */
  private _readGroup = async (
    transport: Transport,
    ride: Ride,
    target: RequestTarget,
    unit: ClientUnit,
    type: RegisterType,
    [groupAddress, groupLength]: AddressGroup,
    groupIndex: number
  ): Promise<
    | {
        rows: RegisterData[]
        result: AddressGroupResult
        heard: 'answered' | 'silent' | undefined
        error: unknown
      }
    | undefined
  > => {
    const result: AddressGroupResult = { roundTripMillis: undefined, error: undefined }
    const groupTarget: RequestTarget = {
      ...target,
      onRoundTrip: (roundTripMillis) => {
        result.roundTripMillis = roundTripMillis
      }
    }
    const settled = await this._settle(
      ride,
      this._readers[type](transport, groupTarget, groupAddress, groupLength, unit.littleEndian)
    )
    if (!settled) return undefined
    const heard =
      settled.ok || (isModbusException(settled.error) && !isGatewaySilence(settled.error))
        ? 'answered'
        : isTimeout(settled.error) || isGatewaySilence(settled.error)
          ? 'silent'
          : undefined
    if (settled.ok) {
      settled.result.forEach((row) => {
        row.groupIndex = groupIndex
      })
      return { rows: settled.result, result, heard, error: undefined }
    }
    result.error = errorText(settled.error)
    const rows: RegisterData[] = []
    for (const [addressKey, mapValue] of Object.entries(unit.registerMapping[type])) {
      const mappedAddress = Number(addressKey)
      if (
        mappedAddress >= groupAddress &&
        mappedAddress < groupAddress + groupLength &&
        isConfiguredAddress(type, mapValue)
      ) {
        rows.push({
          id: mappedAddress,
          buffer: new Uint8Array(2),
          hex: '0000',
          words: undefined,
          bit: false,
          isScanned: false,
          error: result.error,
          groupIndex
        })
      }
    }
    return { rows, result, heard, error: settled.error }
  }

  /**
   * The samples one group's rows give the log: one per register that logs,
   * stamped with when the group was answered. A failed group's error row gives
   * a sample with its error, and a value of NaN rather than the 0 the row
   * carries, so "the value was 0" stays apart from "the device said nothing".
   */
  private _samplesOf = (
    unit: ClientUnit,
    type: RegisterType,
    rows: RegisterData[]
  ): PendingSample[] => {
    const time = Date.now()
    const samples: PendingSample[] = []
    for (const row of rows) {
      const mapValue = unit.registerMapping[type][row.id]
      const setting = mapValue?.log
      if (setting === undefined || !isLoggable(type, mapValue)) continue
      samples.push({
        series: { unit: unit.uuid, type, address: row.id },
        setting,
        time,
        value: loggedValue(type, mapValue.dataType, row) ?? NaN,
        error: row.error
      })
    }
    return samples
  }

  /**
   * Read one of the groups Monitor shows, and nothing else of this client's
   * until it has answered, as `read` does. The group has to be one the unit's
   * mapping configures, because a group is what Monitor draws a head for.
   */
  public readGroup = async (
    unit: string,
    type: RegisterType,
    group: AddressGroup
  ): Promise<void> => {
    if (!this._requireClient('read')) return
    const found = this._unitOrSay('read', unit)
    if (!found) return
    const groups = configuredReadGroups(true, type, found.registerMapping)
    const groupIndex = groups.findIndex(
      ([address, length]) => address === group[0] && length === group[1]
    )
    if (groupIndex === -1) {
      this._emitMessage({
        message: 'Cannot read, the mapping has no such group',
        variant: 'warning',
        error: null
      })
      return
    }
    if (this._refusesUnitId('read', found.unitId)) return
    const transport = this._connectedTransport('read')
    if (!transport) return

    this._clientState.reading = true
    this._sendClientState()
    try {
      const ride = this._rideOn(transport)
      const readGeneration = this._appState.readGeneration(found.uuid)
      const target = this._target(ride, found.unitId, this._appState.registerConfig.timeout)
      const read = await this._readGroup(transport, ride, target, found, type, group, groupIndex)
      if (!read || this._appState.readGeneration(found.uuid) !== readGeneration) return
      this._windows.send(
        'group_data',
        {
          uuid: this.uuid,
          unit: found.uuid,
          type,
          group,
          result: read.result,
          registerData: read.rows
        },
        'main'
      )
      this._hear(found.uuid, read.heard === undefined ? undefined : read.heard === 'answered')
    } finally {
      this._clientState.reading = false
      this._sendClientState()
    }
  }

  /**
   * Count what a read of a unit heard, and say when the unit goes offline or
   * comes back.
   *
   * A unit is offline after the app's `offlineAfterTimeouts` reads in a row that it let
   * run out, and one answer brings it back. A read that says nothing about the
   * unit, because its connection went or it was stopped, or failed some other
   * way, leaves the count alone. So does one that went out under a unit id the
   * unit has left since: that moves the read generation, and `_readSection`
   * answers nothing for it.
   */
  private _hear = (unit: string, answered: boolean | undefined): void => {
    if (answered === undefined) return
    const silentReads = answered ? 0 : (this._silentReads.get(unit) ?? 0) + 1
    this._silentReads.set(unit, silentReads)
    const offline = silentReads >= this._connectionSettings().offlineAfterTimeouts
    this._roundsToSkip.set(unit, offline ? this._roundsOffline(unit) : 0)
    this._setOffline(unit, offline)
  }

  /**
   * How many rounds an offline unit sits out: `pollDelay` for its silent reads,
   * in poll rates, less the round that reads it.
   */
  private _roundsOffline = (unit: string): number => {
    const { pollRate } = this._appState.registerConfig
    const delay = pollDelay(pollRate, this._connectionSettings(), this._silentReads.get(unit) ?? 0)
    return Math.ceil(delay / pollRate) - 1
  }

  /** Put a unit in or out of `offlineUnits`, and say so when that changes it. */
  private _setOffline = (unit: string, offline: boolean): void => {
    const { offlineUnits } = this._clientState
    if (offlineUnits.includes(unit) === offline) return
    this._clientState.offlineUnits = offline
      ? [...offlineUnits, unit]
      : offlineUnits.filter((uuid) => uuid !== unit)
    this._sendClientState()
  }

  //
  //
  //
  //
  // Polling
  /**
   * The register types a poll would read of `unit` were all of it on screen.
   * In Monitor, a type with a group whose Poll is on. In Debug, a polled type:
   * under the unit's read configuration one the mapping has groups for, and
   * otherwise one whose window asks for registers.
   */
  private _pollableTypes = (unit: ClientUnit): RegisterType[] => {
    const readConfiguration = this._appState.readConfiguration(unit.uuid)
    return RegisterTypeSchema.options.filter((type) => {
      if (this._monitorPolls()) return monitorPolledGroups(type, unit.registerMapping).length > 0
      return (
        unit.sections[type].polled &&
        (readConfiguration
          ? configuredReadGroups(true, type, unit.registerMapping).length > 0
          : !this._readsNothing(unit, type, false))
      )
    })
  }

  /** What of the units Debug has on screen, the only sections its poll round reads. */
  private _visibleSections: ClientVisibleSections['sections'] = []

  /**
   * Whether the client is on screen in Monitor. A poll then reads the mapping's
   * groups of every unit, whatever the unit's read configuration says, and so
   * does a write's read back.
   */
  private _monitor = false

  /**
   * Whether the poll reads what Monitor shows: while Monitor is on screen, and
   * while logging is on, whatever the screen shows. Debug then reads nothing
   * of its own.
   */
  private _monitorPolls = (): boolean => this._monitor || this._logEnabled

  /** Whether a read of `unit` takes the mapping's groups: Monitor's, or under its read configuration. */
  private _readsConfiguration = (unit: ClientUnit, monitor: boolean): boolean =>
    monitor || this._appState.readConfiguration(unit.uuid)

  /**
   * The register types a poll round reads of `unit`: its pollable types on
   * screen in Debug, and all of them in Monitor, which shows every unit.
   */
  private _polledTypes = (unit: ClientUnit): RegisterType[] =>
    this._pollableTypes(unit).filter(
      (type) =>
        this._monitorPolls() ||
        this._visibleSections.some((section) => section.unit === unit.uuid && section.type === type)
    )

  /** The register types of `unit` with a register that logs. */
  private _loggedTypes = (unit: ClientUnit): RegisterType[] =>
    RegisterTypeSchema.options.filter((type) =>
      Object.values(unit.registerMapping[type]).some((mapValue) => isLogged(type, mapValue))
    )

  /**
   * The reads a poll round makes of `unit`. While Monitor polls, one read per
   * type of the groups `_monitorRoundGroups` names, which covers the log too.
   * Otherwise the sections Debug shows.
   */
  private _roundReads = (unit: ClientUnit): RoundRead[] =>
    RegisterTypeSchema.options.flatMap((type): RoundRead[] => {
      if (this._monitorPolls()) {
        const groups = this._monitorRoundGroups(unit, type)
        return groups.length > 0 ? [{ type, monitor: true, groups }] : []
      }
      return this._polledTypes(unit).includes(type) ? [{ type, monitor: false }] : []
    })

  /**
   * The groups of `type` Monitor's poll round reads of `unit`: the ones whose
   * Poll is on, and while the log runs, a group whose Poll is off as well when
   * a register in it logs.
   */
  private _monitorRoundGroups = (unit: ClientUnit, type: RegisterType): AddressGroup[] =>
    configuredReadGroups(true, type, unit.registerMapping).filter((group) =>
      monitorReadsGroup(type, unit.registerMapping, group, this._log.running)
    )

  /**
   * Take what of the client is on screen. A poll keeps running with nothing on
   * screen and reads again once something is, and `pollIdle` says which of
   * the two it is doing.
   */
  public setVisibleSections = (
    sections: ClientVisibleSections['sections'],
    monitor: boolean
  ): void => {
    this._visibleSections = sections
    this._monitor = monitor
    if (this._clientState.polling) this._sendClientState()
  }

  /**
   * Start a poll chain, unless one is already running.
   *
   * A chain is a round, a wait, and the next round, so a second chain is a
   * second read of the same registers in every round. `start_polling` passes on
   * whatever the renderer sends, so a start can arrive while a chain runs.
   */
  public startPolling = (): void => {
    if (this._clientState.polling) return
    if (!this._requireClient('poll')) return
    const polled = this._appState.units.filter(
      (unit) =>
        this._pollableTypes(unit).length > 0 ||
        (this._logEnabled && this._loggedTypes(unit).length > 0)
    )
    if (polled.length === 0) {
      this._emitMessage({
        message: 'Cannot poll, no section is polled',
        variant: 'warning',
        error: null
      })
      return
    }
    if (polled.some((unit) => this._refusesUnitId('poll', unit.unitId))) return

    this._clientState.polling = true
    if (this._logEnabled) this._log.start(Date.now())
    this._sendClientState()
    this._poll(++this._pollGeneration)
  }

  public stopPolling = (): void => {
    this._log.stop(Date.now(), 'poll stopped')
    clearTimeout(this._pollTimeout)
    this._pollTimeout = undefined
    this._pollGeneration++
    this._clientState.polling = false
    this._sendClientState()
  }

  /**
   * One poll round: every unit in turn, each of its polled types in turn, one
   * request at a time. An offline unit sits out the rounds `_hear` gave it, so
   * a unit that is not there costs the others one timeout per read of it rather
   * than one per round.
   *
   * The units are the ones main holds when the round starts. A unit whose unit
   * id went out of range since stops the poll, as the start would have refused
   * it.
   */
  private _pollRound = async (generation: number): Promise<void> => {
    for (const unit of this._appState.units) {
      if (generation !== this._pollGeneration) return
      const skip = this._roundsToSkip.get(unit.uuid) ?? 0
      if (skip > 0) {
        this._roundsToSkip.set(unit.uuid, skip - 1)
        continue
      }
      const reads = this._roundReads(unit)
      if (reads.length === 0) continue
      if (this._refusesUnitId('poll', unit.unitId)) {
        this.stopPolling()
        return
      }
      let answered: boolean | undefined
      for (const { type, monitor, groups } of reads) {
        const heard = await this._readSection(unit, type, monitor, generation, groups)
        if (heard === true || (heard === false && answered === undefined)) answered = heard
      }
      this._hear(unit.uuid, answered)
    }
  }

  /**
   * Run a round, then arm the next one on the poll rate's grid, as long as this
   * chain is still the current one.
   *
   * `stopPolling` clears the handle a sleeping chain holds, and a chain that is
   * awaiting a round holds none, because `_pollTimeout` is assigned after the
   * await. It takes the generation instead: the round resolves into a number
   * that is no longer current, and the chain ends there rather than arming a
   * timer nothing can clear. `_pollTimeout` is undefined while the round runs,
   * which is what `_rearmPoll` reads.
   */
  private _poll = async (generation: number): Promise<void> => {
    this._pollTimeout = undefined
    this._roundStartedAt = Date.now()
    await this._pollRound(generation)
    if (generation !== this._pollGeneration) return
    // The round's samples reach the log's status once a round, not once a read.
    if (this._log.running) this._sendClientState()
    this._armPoll(generation)
  }

  /** When the last round started, which a re-arm leaves where it is. */
  private _roundStartedAt = 0

  /**
   * Arm the next round on the first tick of the poll rate after the last round
   * started. A round that outlasted the poll rate waits for the tick after it
   * ends, so a slow device is asked at a whole multiple of the rate rather than
   * back to back.
   */
  private _armPoll = (generation: number): void => {
    const rate = this._appState.registerConfig.pollRate
    const elapsed = Date.now() - this._roundStartedAt
    const delay = Math.max(1, Math.ceil(elapsed / rate)) * rate - elapsed
    this._pollTimeout = setTimeout(() => this._poll(generation), delay)
  }

  /**
   * Arm a sleeping poll again for a new poll rate, counted from when its last
   * round started. A poll whose round is running arms its own timer when it
   * ends.
   */
  private _rearmPoll = (): void => {
    if (this._pollTimeout === undefined) return
    clearTimeout(this._pollTimeout)
    this._armPoll(this._pollGeneration)
  }

  //
  //
  // Logging
  /**
   * Switch logging on: after the samples the log holds, or in an empty log.
   * It takes samples from now if the client polls, and from when it starts
   * polling otherwise.
   */
  public startLog = (append: boolean): void => {
    if (!append) this._log.clear()
    this._logEnabled = true
    if (this._clientState.polling) this._log.start(Date.now())
    this._sendClientState()
  }

  /** Switch logging off, keeping the samples it took. */
  public stopLog = (): void => {
    this._logEnabled = false
    this._log.stop(Date.now(), 'log stopped')
    this._sendClientState()
  }

  /** Empty the log. Logging stays on if it was, and a poll running goes on filling it. */
  public clearLog = (): void => {
    this._log.clear()
    if (this._logEnabled && this._clientState.polling) this._log.start(Date.now())
    this._sendClientState()
  }

  /** How many samples the log holds before it overwrites the oldest, for this session. */
  public setLogCapacity = (capacity: number): void => {
    this._log.setCapacity(capacity)
    this._sendClientState()
  }

  public logStatus = (): LogStatus => ({ ...this._log.status(), enabled: this._logEnabled })

  /** Every sample the log holds, oldest first. */
  public logSamples = (): Generator<LogSample> => this._log.samples()

  /** One register's samples for a chart, from `from` and the sequence `after` on. */
  public logWindow = (series: LogSeries, from: number, after: number): LogWindow =>
    this._log.window(series, from, after)

  /**
   * A page of the samples an export asks for: of the registers it names,
   * between `from` and `to` when it gives them.
   */
  public logPage = ({ after, limit, from, to, series }: LogPageQuery): LogPage => {
    const wanted = new Set(series.map(({ unit, type, address }) => `${unit}|${type}|${address}`))
    return this._log.page(
      after,
      ({ unit, type, address, time }) =>
        wanted.has(`${unit}|${type}|${address}`) &&
        (from === undefined || time >= from) &&
        (to === undefined || time <= to),
      limit
    )
  }

  /** Take a connection config update main accepted. */
  public updateConnectionConfig = (update: DeepPartial<ConnectionConfig>): void => {
    this._appState.updateConnectionConfig(update)
  }

  /** Take a register config update, and give a sleeping poll its new wait. */
  public updateRegisterConfig = (update: DeepPartial<RegisterConfig>): void => {
    this._appState.updateRegisterConfig(update)
    this.recountOfflineRounds()
    this._rearmPoll()
  }

  /**
   * Count an offline unit's rounds to sit out again, under a new poll rate or
   * new connection settings, kept at what it had where that is fewer: a lower
   * `maxPollInterval` applies to a unit waiting already, rather than after the
   * wait it was given.
   */
  public recountOfflineRounds = (): void => {
    for (const [unit, skip] of this._roundsToSkip) {
      this._roundsToSkip.set(unit, Math.min(skip, this._roundsOffline(unit)))
    }
  }

  /**
   * Take the units main accepted. A unit whose unit id changed is another
   * device, which has left nothing unanswered yet, and so is a unit that is new.
   */
  public setUnits = (units: ClientUnit[]): void => {
    const before = new Map(this._appState.units.map((unit) => [unit.uuid, unit.unitId]))
    this._appState.setUnits(units)
    const kept = new Set(units.map((unit) => unit.uuid))
    for (const uuid of [...this._silentReads.keys(), ...this._clientState.offlineUnits]) {
      const unit = this._appState.unit(uuid)
      if (kept.has(uuid) && unit && before.get(uuid) === unit.unitId) continue
      this._silentReads.delete(uuid)
      this._roundsToSkip.delete(uuid)
      this._setOffline(uuid, false)
    }
    if (this._clientState.polling) this._sendClientState()
  }

  /** Turn read configuration on or off for one unit. */
  public setReadConfiguration = (unit: string, value: boolean): void => {
    this._appState.setReadConfiguration(unit, value)
    if (this._clientState.polling) this._sendClientState()
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
    input_registers: async (transport, target, address, length, littleEndian) =>
      this._toRegisters(
        await transport.request(target, (modbus) => modbus.readInputRegisters(address, length)),
        address,
        littleEndian
      ),
    holding_registers: async (transport, target, address, length, littleEndian) =>
      this._toRegisters(
        await transport.request(target, (modbus) => modbus.readHoldingRegisters(address, length)),
        address,
        littleEndian
      )
  }

  /**
   * One row per bit that was asked for.
   *
   * The length is the read's own, not the section's. modbus-serial answers a
   * bit read with eight booleans per byte, so a read of three comes back as
   * eight and the row count has to come from the request. Even the window is
   * not the section's length: it is that length under both read ceilings, so
   * 2000 coils asked for at 65500 is a group of 36.
   */
  private _toBits = (result: ReadCoilResult, address: number, length: number): RegisterData[] =>
    convertBitData(result, address, length, this._clientState.scanningRegisters)

  private _toRegisters = (
    result: ReadRegisterResult,
    address: number,
    littleEndian: boolean
  ): RegisterData[] =>
    convertRegisterData(result, address, littleEndian, this._clientState.scanningRegisters)

  //
  //
  //
  //
  // Write
  public write = async (unit: string, writeParameters: WriteParameters): Promise<void> => {
    // `writeFC5`, `writeFC6`, `writeFC15` and `writeFC16` answer a closed port
    // with a `PortNotOpenError` before they file a transaction, so a write down
    // a closed port has nothing of its own to log.
    const transport = this._connectedTransport('write')
    if (!transport) return

    if (!this._requireClient('write')) return
    const found = this._unitOrSay('write', unit)
    if (!found) return
    if (this._refusesUnitId('write', found.unitId)) return
    // The view the write was pressed in, which its read back fills. The view
    // can change while the device answers.
    const monitor = this._monitor

    const { address, type, value, dataType, single } = writeParameters

    // The timeout the user set, the way `_read` does it. A write that took
    // whatever ran last on the connection got a register scan's 100 ms, or the
    // 3000 ms an open sets, rather than the 1000 ms the toolbar's own floor
    // promises.
    const ride = this._rideOn(transport)
    const target = this._target(ride, found.unitId, this._appState.registerConfig.timeout)

    this._clientState.writing = true
    this._sendClientState()
    try {
      let attempt: WriteAttempt

      switch (type) {
        case 'coils':
          attempt = await this._writeCoil(ride, target, address, value, single)
          break
        case 'holding_registers':
          attempt = await this._writeRegister(
            ride,
            target,
            address,
            value,
            dataType,
            single,
            found.littleEndian
          )
          break
      }

      // A write with nothing to read back: refused before it went out, with
      // its own warning, or failed on a connection that went while it waited.
      if (!attempt.sent) return

      // Read back what the device now holds, unless a loop started during the
      // write and is reading anyway. `reading` is not in that question: this
      // write owns the client, so nothing else can have set it.
      if (!readLoopOwner(this._clientState)) await this._readOwningTheClient(found, type, monitor)
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

  /**
   * One write request, and what it did with the port.
   *
   * A write the device took, or refused, is read back over the connection it
   * went out on, and a refusal says why. Once that connection went while the
   * write waited, there is nothing to read back over it and nothing to say:
   * the read back would ask another connection, or none.
   */
  private _sendWrite = async (
    ride: Ride,
    target: RequestTarget,
    send: (modbus: ModbusRTU) => Promise<unknown>
  ): Promise<WriteAttempt> => {
    const settled = await this._settle(ride, ride.transport.request<unknown>(target, send))
    if (!settled) return { sent: false }
    if (!settled.ok) {
      this._emitMessage({
        message: errorText(settled.error),
        variant: 'error',
        error: settled.error
      })
    }
    return { sent: true }
  }

  private _writeCoil = (
    ride: Ride,
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
      return Promise.resolve({ sent: false })
    }

    return this._sendWrite(ride, target, (modbus) =>
      single
        ? this._awaitWrite<WriteCoilResult>((next) =>
            modbus.writeFC5(target.unitId, address, first, next)
          )
        : this._awaitWrite<WriteMultipleResult>((next) =>
            modbus.writeFC15(target.unitId, address, value, next)
          )
    )
  }

  private _writeRegister = (
    ride: Ride,
    target: RequestTarget,
    address: number,
    value: number,
    dataType: DataType,
    single: boolean,
    littleEndian: boolean
  ): Promise<WriteAttempt> => {
    if (single && !['int16', 'uint16'].includes(dataType)) {
      this._emitMessage({
        message: 'Single register only supported for 16 bit values',
        variant: 'warning',
        error: undefined
      })
      return Promise.resolve({ sent: false })
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
      return Promise.resolve({ sent: false })
    }

    const registers = createRegisters(dataType, value, littleEndian)

    return this._sendWrite(ride, target, (modbus) =>
      single
        ? this._awaitWrite<WriteRegisterResult>((next) =>
            modbus.writeFC6(target.unitId, address, registers[0], next)
          )
        : this._awaitWrite<WriteMultipleResult>((next) =>
            modbus.writeFC16(target.unitId, address, registers, next)
          )
    )
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
    if (this._refusesUnitId('scan', Math.max(...params.range))) return
    this.stopPolling()

    this._clientState.scanningUnitIds = true
    this._sendClientState()

    const ride = this._rideOn(transport)
    const scan = ++this._scanGeneration
    const { range } = params

    this._totalScans = (range[1] - range[0] + 1) * params.registerTypes.length
    this._scansDone = 0
    this._scanProgressSentAt = 0

    for (let id = range[0]; id <= range[1]; id++) {
      if (!(await this._scanUnitIds({ id, ride, scan, ...params }))) break
    }

    // A scan that ended with its connection can finish after a new one
    // started on the next, and the flag is that one's then.
    if (scan !== this._scanGeneration) return
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
    ride,
    scan
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
      if (!this._stillScanning('scanningUnitIds', scan)) return false

      const settled = await this._settle(
        ride,
        this._readers[registerType](
          ride.transport,
          this._target(ride, id, timeout),
          address,
          length,
          false
        )
      )
      // A connection that went is not an id that did not answer, so the id
      // gets no result, and neither does one a newer scan has overtaken.
      if (!settled) return false
      if (scan !== this._scanGeneration) return false
      if (settled.ok) {
        result.registerTypes.push(registerType)
      } else {
        result.errorMessage[registerType] = errorText(settled.error)
        if (isModbusException(settled.error)) result.refusedRegisterTypes.push(registerType)
      }

      this._countScanStep()
    }

    if (!this._stillScanning('scanningUnitIds', scan)) return false

    this._sendUnitIdResult(result)
    return true
  }

  //
  //
  //
  //
  // Scan Registers
  public scanRegisters = async (
    unit: string,
    type: RegisterType,
    params: ScanRegistersParameters
  ): Promise<void> => {
    const transport = this._connectedTransport('scan')
    if (!transport) return
    if (!this._requireClient('scan', true)) return
    const found = this._unitOrSay('scan', unit)
    if (!found) return
    if (this._refusesUnitId('scan', found.unitId)) return
    this.stopPolling()

    const ride = this._rideOn(transport)
    const target = this._target(ride, found.unitId, params.timeout)

    // The chunk is the stride, the divisor of the progress and the quantity of
    // every request, so it is one number here. `ScanRegistersParametersSchema`
    // takes any positive chunk size, and `ChunkSizeField`'s mask reads the
    // register type selected, so a chunk of 2000 typed under coils reaches this
    // with holding registers selected.
    const { addressRange } = params
    const length = Math.min(params.length, maxReadQuantity([type]))

    this._totalScans = Math.ceil((addressRange[1] - addressRange[0] + 1) / length)
    this._scansDone = 0
    this._scanProgressSentAt = 0

    this._clientState.scanningRegisters = true
    this._sendClientState()

    const scan = ++this._scanGeneration

    for (let address = addressRange[0]; address <= addressRange[1]; address += length) {
      const next = await this._scanRegister(
        ride,
        scan,
        target,
        { unit: found, type },
        address,
        length,
        addressRange[1]
      )
      if (!next) break
      this._countScanStep()
      if (!this._stillScanning('scanningRegisters', scan)) break
    }

    if (scan !== this._scanGeneration) return
    this._clientState.scanningRegisters = false
    this._sendClientState()
  }

  /**
   * Answers whether the scan may go on, which is no once its ride ended or a
   * newer scan started. What an overtaken scan brings back is the old range's,
   * and the grid is the newer scan's by then.
   */
  private _scanRegister = async (
    ride: Ride,
    scan: number,
    target: RequestTarget,
    { unit, type }: { unit: ClientUnit; type: RegisterType },
    address: number,
    length: number,
    lastAddress: number
  ): Promise<boolean> => {
    // The last chunk alone, so the stride its caller walks is untouched. What
    // one response carries is clamped there, where the same number is the
    // stride and the progress divisor. It stops at the range's last address,
    // and `lastAddress` is at most 65535, so the map's end bounds it too.
    length = Math.min(length, lastAddress - address + 1)

    const settled = await this._settle(
      ride,
      this._readers[type](ride.transport, target, address, length, unit.littleEndian)
    )
    if (!settled) return false
    if (scan !== this._scanGeneration) return false
    if (!settled.ok) {
      this._emitMessage({
        message: errorText(settled.error),
        variant: 'error',
        error: settled.error
      })
      return true
    }

    const data = settled.result.filter((row) =>
      isBooleanRegister(type) ? row.bit : row.hex !== '0000'
    )
    // A scan's rows are the Debug grid's, which shows the scan.
    this._sendData(unit.uuid, type, data, false)
    return true
  }

  public stopScanningRegisters = (): void => {
    // Set scanning registers to false so the scanning is stopped
    // after the last asynchonous operation has completed.
    this._clientState.scanningRegisters = false
  }

  get state(): ClientState {
    return this._clientState
  }

  /** What main holds of this client's configuration. */
  get config(): AppState {
    return this._appState
  }

  /**
   * Whether `update` may change this client's connection config, having said
   * why not.
   *
   * A client that is not disconnected rides a connection opened on that config,
   * so a new protocol, address or line would leave it riding one its config
   * no longer names. An update that changes nothing, such as a window handing
   * main the config it loaded, is no change.
   */
  public mayUpdateConnection = (update: DeepPartial<ConnectionConfig>): boolean => {
    if (this._clientState.connectState === 'disconnected') return true
    const now = this._appState.connectionConfig
    if (isDeepStrictEqual(this._appState.connectionConfigAfter(update), now)) return true
    this._emitMessage({
      message: 'Disconnect before changing the connection',
      variant: 'warning',
      error: null
    })
    return false
  }
}
