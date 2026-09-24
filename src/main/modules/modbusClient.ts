import type ModbusRTU from 'modbus-serial'
import { isDeepStrictEqual } from 'util'
import { AppState } from '../state'
import {
  AddressGroup,
  BackendMessage,
  BaseDataType,
  ClientState,
  ConnectionConfig,
  ConnectState,
  clientOwner,
  convertBitData,
  configuredReadGroups,
  convertRegisterData,
  DeepPartial,
  createRegisters,
  defaultClientState,
  isBooleanRegister,
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
  ScanRegistersParameters,
  ScanUnitIDParameters,
  ScanUnitIDResult,
  WriteParameters
} from '@shared'
import { Windows } from '../windows'
import { errorText, isGatewaySilence, isModbusException, isTimeout } from './modbusClient/errors'
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
   * How many reads in a row the device has left unanswered. Another unit id is
   * another device, and `updateConnectionConfig` starts it from 0.
   */
  private _silentReads = 0
  private _totalScans = 1
  private _scansDone = 1

  constructor({ uuid, appState, windows, transports }: ClientParams) {
    this.uuid = uuid
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
    this._windows.send('client_state', { uuid: this.uuid, clientState: this._clientState }, 'main')
  }
  private _sendData = (registerData: RegisterData[]): void => {
    this._windows.send('register_data', { uuid: this.uuid, registerData }, 'main')
  }
  private _sendUnitIdResult = (result: ScanUnitIDResult): void => {
    this._windows.send('scan_unit_id_result', { uuid: this.uuid, result }, 'main')
  }

  private _sendGroups = (addressGroups: AddressGroup[]): void => {
    this._windows.send('address_groups', { uuid: this.uuid, addressGroups }, 'main')
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
  /** The one place the connect state changes, which is where a ride ends. */
  private _enter = (connectState: ConnectState): void => {
    if (this._clientState.connectState === 'connected' && connectState !== 'connected') {
      this._ride++
    }
    this._clientState.connectState = connectState
  }

  private _setDisconnected = (): void => {
    this._enter('disconnected')
    this._silentReads = 0
    this._clientState.offline = false
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
   * Whether `verb` would ask for no registers, having said so.
   *
   * The length field keeps a 0 it refused rather than sending it, but `init`
   * hands main the whole stored register config, so after a restart main holds
   * the 0 the field showed. A read and the read back of a write ask it before
   * they own the client, `startPolling` before a poll starts, and a poll's own
   * read on every tick.
   */
  private _refusesLength = (verb: string): boolean => {
    const { readConfiguration, registerMapping, registerConfig } = this._appState
    const lengthGiven = isReadLengthGiven(registerConfig.length)
    if (!readsNothing(readConfiguration, registerConfig.type, registerMapping, lengthGiven)) {
      return false
    }
    this._emitMessage({ message: `Cannot ${verb} a length of 0`, variant: 'warning', error: null })
    return true
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
    if (this._refusesLength('read')) return
    this._clientState.reading = true
    this._sendClientState()
    try {
      this._hear(await this._read())
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
   *
   * Answers true when the device answered, false for only silence, and nothing
   * for a read that says neither, which is what `_hear` counts.
   */
  private _read = async (pollGeneration?: number): Promise<boolean | undefined> => {
    const transport = this._connectedTransport('read', this._clientState.polling)
    if (!transport) return undefined
    const ride = this._rideOn(transport)
    const stopped = (): boolean =>
      pollGeneration !== undefined && pollGeneration !== this._pollGeneration

    // `startPolling` refused a poll of no registers, so a poll that gets here
    // lost its configured groups since, and it stops rather than read nothing
    // on every tick.
    if (pollGeneration !== undefined && this._refusesLength('poll')) {
      this.stopPolling()
      return undefined
    }

    // What this read is addressed to, taken before the first request goes out.
    const readGeneration = this._appState.readGeneration
    const target = this._target(
      ride,
      this._appState.connectionConfig.unitId,
      this._appState.registerConfig.timeout
    )

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
    // An exception is an answer as much as a value is: the device is there.
    // A gateway's 10 or 11 is the gateway answering for a device that is not.
    let answered = false
    let silent = false

    for (const [groupIndex, [groupAddress, groupLength]] of groups.entries()) {
      if (stopped()) return undefined
      const settled = await this._settle(
        ride,
        this._readers[type](transport, target, groupAddress, groupLength)
      )
      // The connection went while this group waited, so nothing of this read
      // goes anywhere.
      if (!settled) return undefined
      if (settled.ok || (isModbusException(settled.error) && !isGatewaySilence(settled.error))) {
        answered = true
      } else if (isTimeout(settled.error) || isGatewaySilence(settled.error)) {
        silent = true
      }
      if (settled.ok) {
        settled.result.forEach((row) => {
          row.groupIndex = groupIndex
        })
        data.push(...settled.result)
      } else {
        const { error } = settled
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
    }

    // A reply describes the unit id, type, address and length the requests
    // went out under, and carries none of them. `register_data` replaces the
    // grid with what arrives, and `clearRegisterDataWhenIdle` has emptied it or
    // drawn the new mapping by then, so the old unit's values would land in the
    // rows drawn for the new one. The renderer cannot tell the two apart: only
    // main knows what its read asked. The transport logged the transactions
    // above either way, because they happened.
    if (this._appState.readGeneration !== readGeneration) return undefined
    if (stopped()) return undefined

    if (data.length > 0) {
      // Send the groups so we can slice the utf8 string correctly.
      this._sendGroups(groups)
      this._sendData(data)
    }
    if (answered) return true
    return silent ? false : undefined
  }

  /**
   * Count what a read heard, and say when the device goes offline or comes
   * back.
   *
   * A device is offline after `offlineAfterTimeouts` reads in a row that it let
   * run out, and one answer brings it back. A read that says nothing about the
   * device, because its connection went or it was stopped, or failed some
   * other way, leaves the count alone. So does one that went out to a unit id
   * the client has left since: that moves the read generation, and `_read`
   * answers nothing for it.
   */
  private _hear = (answered: boolean | undefined): void => {
    if (answered === undefined) return
    this._silentReads = answered ? 0 : this._silentReads + 1
    const offline = this._silentReads >= this._appState.registerConfig.offlineAfterTimeouts
    if (offline === this._clientState.offline) return
    this._clientState.offline = offline
    this._sendClientState()
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
   * read of the same registers in every round. `start_polling` passes on
   * whatever the renderer sends, so a start can arrive while a chain runs.
   */
  public startPolling = (): void => {
    if (this._clientState.polling) return
    if (!this._requireClient('poll')) return
    if (this._refusesLength('poll')) return

    this._clientState.polling = true
    this._sendClientState()
    this._poll(++this._pollGeneration)
  }

  public stopPolling = (): void => {
    clearTimeout(this._pollTimeout)
    this._pollTimeout = undefined
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
   * timer nothing can clear. `_pollTimeout` is undefined while the read runs,
   * which is what `_rearmPoll` reads.
   */
  private _poll = async (generation: number): Promise<void> => {
    this._pollTimeout = undefined
    this._hear(await this._read(generation))
    if (generation !== this._pollGeneration) return
    this._pollArmedAt = Date.now()
    this._pollTimeout = setTimeout(
      () => this._poll(generation),
      pollDelay(this._appState.registerConfig, this._silentReads)
    )
  }

  /** When the sleeping poll went to sleep, which a re-arm leaves where it is. */
  private _pollArmedAt = 0

  /**
   * Arm a sleeping poll again for the wait it is owed now, counted from when
   * it went to sleep: an offline device's wait runs up to `maxPollInterval`,
   * and a new unit id or poll setting should not sit behind it. A poll whose
   * read is running arms its own timer when the read ends.
   */
  private _rearmPoll = (): void => {
    if (this._pollTimeout === undefined) return
    clearTimeout(this._pollTimeout)
    const generation = this._pollGeneration
    const waited = Date.now() - this._pollArmedAt
    const delay = pollDelay(this._appState.registerConfig, this._silentReads)
    this._pollTimeout = setTimeout(() => this._poll(generation), Math.max(0, delay - waited))
  }

  /** Take a connection config update main accepted. */
  public updateConnectionConfig = (update: DeepPartial<ConnectionConfig>): void => {
    const unitId = this._appState.connectionConfig.unitId
    this._appState.updateConnectionConfig(update)
    if (this._appState.connectionConfig.unitId === unitId) return
    // Another unit is another device, which has left nothing unanswered yet.
    this._silentReads = 0
    if (this._clientState.offline) {
      this._clientState.offline = false
      this._sendClientState()
    }
    this._rearmPoll()
  }

  /** Take a register config update, and give a sleeping poll its new wait. */
  public updateRegisterConfig = (update: DeepPartial<RegisterConfig>): void => {
    this._appState.updateRegisterConfig(update)
    this._rearmPoll()
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
    const ride = this._rideOn(transport)
    const target = this._target(
      ride,
      this._appState.connectionConfig.unitId,
      this._appState.registerConfig.timeout
    )

    this._clientState.writing = true
    this._sendClientState()
    try {
      let attempt: WriteAttempt

      switch (type) {
        case 'coils':
          attempt = await this._writeCoil(ride, target, address, value, single)
          break
        case 'holding_registers':
          attempt = await this._writeRegister(ride, target, address, value, dataType, single)
          break
      }

      // A write with nothing to read back: refused before it went out, with
      // its own warning, or failed on a connection that went while it waited.
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

  private _writeCoil = async (
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
      return { sent: false }
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

  private _writeRegister = async (
    ride: Ride,
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
          length
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
  public scanRegisters = async (params: ScanRegistersParameters): Promise<void> => {
    const transport = this._connectedTransport('scan')
    if (!transport) return
    if (!this._requireClient('scan', true)) return
    this.stopPolling()

    const ride = this._rideOn(transport)
    const target = this._target(ride, this._appState.connectionConfig.unitId, params.timeout)

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

    const scan = ++this._scanGeneration

    for (let address = addressRange[0]; address <= addressRange[1]; address += length) {
      if (!(await this._scanRegister(ride, scan, target, address, length))) break
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
    address: number,
    length: number
  ): Promise<boolean> => {
    const type = this._appState.registerConfig.type
    // The last chunk alone, so the stride its caller walks is untouched. What
    // one response carries is clamped there, where the same number is the
    // stride and the progress divisor.
    length = Math.min(length, registersFrom(address))

    const settled = await this._settle(
      ride,
      this._readers[type](ride.transport, target, address, length)
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
    this._sendData(data)
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
   * no longer names. The unit id goes out with each request, so it may change,
   * and an update that changes nothing, such as a window handing main the
   * config it loaded, is no change.
   */
  public mayUpdateConnection = (update: DeepPartial<ConnectionConfig>): boolean => {
    if (this._clientState.connectState === 'disconnected') return true
    const now = this._appState.connectionConfig
    const after = this._appState.connectionConfigAfter(update)
    if (isDeepStrictEqual({ ...after, unitId: now.unitId }, now)) return true
    this._emitMessage({
      message: 'Disconnect before changing the connection',
      variant: 'warning',
      error: null
    })
    return false
  }
}
