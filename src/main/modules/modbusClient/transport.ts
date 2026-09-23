import ModbusRTU from 'modbus-serial'
import {
  BackendMessage,
  ConnectionConfig,
  ConnectState,
  PROTOCOL_LABELS,
  humanizeSerialError
} from '@shared'
import { Windows } from '../../windows'
import { errorText } from './errors'
import { TransactionLog } from './transactionLog'

/**
 * What a transport tells the clients riding it.
 *
 * The connect state a client reports is the state of the connection under it,
 * so the transport decides it and each client carries it to its own view.
 */
export interface TransportClient {
  /** Take this connect state and report it. */
  setConnectState: (connectState: ConnectState) => void
  /**
   * The connection is gone and nothing will reopen it for this client.
   *
   * The one call that names its transport: `detach` makes it once the close
   * has answered, which can be seconds after the client left for another
   * connection, and then it is about the one the client left.
   */
  transportClosed: (from: Transport) => void
  /** The connection was lost and a reconnect is under way. */
  connectionLost: () => void
  /** A reconnect after a loss opened the connection again. */
  reconnected: () => void
}

/** Who a request is for, which the connection it shares knows nothing of. */
export interface RequestTarget {
  unitId: number
  timeout: number
}

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

interface TransportParams {
  key: string
  /**
   * The config it was made for. `attach` replaces it with the config of the
   * client that opens it, which is what the connection opens with.
   */
  config: ConnectionConfig
  windows: Windows
  /** Called once nothing rides the transport and nothing is opening or closing it. */
  onIdle: (transport: Transport) => void
}

/**
 * One connection, and the queue every request on it waits in.
 *
 * A `ModbusRTU` holds one port, and a port carries one request at a time: an
 * RTU frame has no transaction id, so a second request on the wire takes the
 * first one's reply, and on a serial port both file under transaction key 1.
 * `run` is where that is enforced for every client riding the connection,
 * because each client only knows about its own requests.
 */
export class Transport {
  readonly key: string
  private readonly _modbus = new ModbusRTU()
  private _config: ConnectionConfig
  private _windows: Windows
  private _onIdle: (transport: Transport) => void

  /** The clients riding this connection, connected or waiting for it to open. */
  private _clients = new Set<TransportClient>()

  /** The last request queued, which the next one waits behind. */
  private _queue: Promise<unknown> = Promise.resolve()

  private _reconnectTimeout: NodeJS.Timeout | undefined
  private _shouldAutoReconnect = true
  private _reconnectDelay = 3000 // ms
  private _consecutiveReconnects = 0
  private _maxConsecutiveReconnects = 5
  private _reconnectResetTimeout: NodeJS.Timeout | undefined

  /**
   * Which open the port that opens belongs to.
   *
   * `open` awaits the library, and the last client can leave while it waits:
   * the button is a Cancel for as long as the state is 'connecting'. Without
   * this the cancelled open resumes and reports 'connected' over a port the
   * user asked the app to let go of.
   */
  private _generation = 0

  /**
   * Whether an open is on its way back.
   *
   * One `ModbusRTU` holds one port at a time, and a cancelled open is still
   * opening after the cancel reported 'disconnected', which is a Connect
   * button. A connect in that window would open the same path again, and a
   * serial port that is still opening or closing refuses it.
   */
  private _openInFlight = false

  /** Whether the last client's close is still on its way back. */
  private _closing = false

  /** What went out and what came back, read off modbus-serial's own table. */
  private _transactionLog: TransactionLog

  constructor({ key, config, windows, onIdle }: TransportParams) {
    this.key = key
    this._config = config
    this._windows = windows
    this._onIdle = onIdle
    this._transactionLog = new TransactionLog({ client: this._modbus, windows })
    this._attachHandlers()
  }

  get isOpen(): boolean {
    return this._modbus.isOpen
  }

  /** Whether `client` rides this connection. */
  public rides = (client: TransportClient): boolean => this._clients.has(client)

  /**
   * Register the handlers that carry connection errors and auto-reconnect.
   *
   * These live on the `ModbusRTU` object rather than on the port, so the
   * handlers are the transport's for as long as it holds that object.
   */
  private _attachHandlers = (): void => {
    this._modbus
      .on('error', (error) => {
        this._setConnectState('disconnected')
        this._emitMessage({
          message: errorText(error) || 'Connection error',
          variant: 'error',
          error: error
        })
      })
      .on('close', () => {
        if (this._shouldAutoReconnect) {
          // The connection this timer vouched for is gone. Left running, it
          // would zero the count in the middle of the burst that follows, and
          // the burst would run past its limit.
          clearTimeout(this._reconnectResetTimeout)

          // Only emit reconnecting message if not already in connecting state
          if (!this._reconnectTimeout) {
            this._emitMessage({
              message: `Connection lost, reconnecting (${this._consecutiveReconnects + 1}/${this._maxConsecutiveReconnects})...`,
              variant: 'warning',
              error: null
            })
          }
          for (const client of this._clients) client.connectionLost()
          this._scheduleReconnect()
        } else {
          // Every close that gets here is one the app did not ask for.
          // modbus-serial takes its close relay off the port inside `close()`,
          // so the close `detach` asks for reaches no handler. Measured on
          // 8.0.25 over TCP, over a socat pty and on an Arduino's USB serial
          // port. The other way out of `detach` is the timeout, and that one
          // takes the handlers off itself, for the reason written there.
          this._setConnectState('disconnected')
          this._emitMessage({
            message: 'Connection closed unexpectedly',
            variant: 'error',
            error: null
          })
        }
      })
  }

  /**
   * Every transport message goes to the main window, the only window that
   * draws the client view. `ModbusClient._emitMessage` says why.
   */
  private _emitMessage = (message: BackendMessage): void => {
    this._windows.send('backend_message', message, 'main')
  }

  private _setConnectState = (connectState: ConnectState): void => {
    for (const client of this._clients) client.setConnectState(connectState)
  }

  /** Every client lets go, and the transport says so once nothing is opening or closing it. */
  private _closeForEveryone = (): void => {
    const clients = [...this._clients]
    this._clients.clear()
    for (const client of clients) client.transportClosed(this)
    this._idleWhenDone()
  }

  private _idleWhenDone = (): void => {
    if (this._clients.size > 0 || this._openInFlight || this._closing) return
    this._onIdle(this)
  }

  //
  //
  // Queue
  /**
   * One request, sent once every request queued before it has answered, and
   * logged under the key it filed.
   *
   * The unit id and the timeout are set inside the turn rather than by the
   * caller, because they are the `ModbusRTU`'s and every client on the
   * connection sets its own: set outside, the next client's request would go
   * out under them. The log is inside the turn for the same reason: on a
   * serial port every request files under key 1, so a log written after the
   * turn would delete the entry of the request that went next.
   */
  public request = <Result>(
    { unitId, timeout }: RequestTarget,
    send: (modbus: ModbusRTU) => Promise<Result>
  ): Promise<Result> =>
    this._run(async (modbus) => {
      modbus.setID(unitId)
      modbus.setTimeout(timeout)
      const transactionIdKey = this._transactionLog.nextTransactionIdKey()
      try {
        const result = await send(modbus)
        this._transactionLog.log(transactionIdKey, undefined)
        return result
      } catch (error) {
        this._transactionLog.log(transactionIdKey, errorText(error))
        throw error
      }
    })

  /**
   * A turn on the connection, after every turn queued before it.
   *
   * The task reaches the `ModbusRTU` when its turn comes rather than when it is
   * queued. A failed turn does not fail the queue: the next one waits for it to
   * settle, not to succeed.
   */
  private _run = <Result>(task: (modbus: ModbusRTU) => Promise<Result>): Promise<Result> => {
    const turn = this._queue.then(() => task(this._modbus))
    this._queue = turn.catch(() => undefined)
    return turn
  }

  //
  //
  // Connect
  /**
   * Whether a client may not ride this connection yet, having said why.
   *
   * A close that is still closing, or a cancelled open that is still opening,
   * holds the port the next open would ask for. `attach` asks it, and
   * `ModbusClient.connect` asks it first as well, because a refused connect
   * keeps the client on the transport it rode.
   */
  public refuses = (): boolean => {
    if (!this._closing && !(this._openInFlight && this._clients.size === 0)) return false
    this._emitMessage({
      message: this._closing
        ? 'Still closing that connection, try again in a moment'
        : 'Still finishing the connect you cancelled',
      variant: 'warning',
      error: null
    })
    return true
  }

  /**
   * Ride this connection, opening it when nothing has yet.
   *
   * A client joining a connection that is open is connected at once. One
   * joining a connection that is opening waits for that open, and is told how
   * it ended with everyone else. A client that opens it opens it with its own
   * `config`: the key leaves the line settings out, so the config the
   * transport was made with can be older than what the user set since.
   */
  public attach = async (client: TransportClient, config: ConnectionConfig): Promise<void> => {
    if (this.refuses()) return

    if (this._clients.has(client) && this._modbus.isOpen) {
      this._emitMessage({ message: 'Already connected', variant: 'warning', error: null })
      client.setConnectState('connected')
      return
    }

    this._clients.add(client)

    if (this._modbus.isOpen && !this._reconnectTimeout) {
      this._emitMessage({
        message: `Connected over ${PROTOCOL_LABELS[this._config.protocol]}`,
        variant: 'success',
        error: null
      })
      client.setConnectState('connected')
      return
    }

    client.setConnectState('connecting')
    if (this._openInFlight || this._reconnectTimeout) return
    this._config = structuredClone(config)
    await this._open(false)
  }

  // --- Auto-reconnect logic ---
  private _scheduleReconnect = (): void => {
    this._consecutiveReconnects++

    if (this._consecutiveReconnects >= this._maxConsecutiveReconnects) {
      this._shouldAutoReconnect = false
      this._emitMessage({
        message: 'Too many consecutive reconnect attempts, giving up',
        variant: 'error',
        error: null
      })
      this._reconnectTimeout = undefined
      this._closeForEveryone()
      return
    }

    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = setTimeout(() => this._open(true), this._reconnectDelay)
  }

  private _open = async (reconnect: boolean): Promise<void> => {
    const generation = ++this._generation
    this._shouldAutoReconnect = true
    if (!reconnect) this._consecutiveReconnects = 0
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = undefined
    this._setConnectState('connecting')

    const { protocol, tcp, rtu } = this._config
    const { host, options: tcpOptions } = tcp
    const { com, options: rtuOptions } = rtu

    this._modbus.setTimeout(3000)

    // Enables storing transaction requests and responses for logging purposes
    this._modbus['isDebugEnabled'] = true

    this._openInFlight = true
    try {
      if (protocol === 'ModbusTcp') {
        // A copy, because `connectTCP` writes the client's own timeout into the
        // options object it is handed.
        await this._modbus.connectTCP(host, { ...tcpOptions })
      } else if (protocol === 'ModbusRtuOverTcp') {
        // Encapsulated RTU: a full RTU frame (with CRC) sent raw over a TCP
        // socket, for serial-to-Ethernet gateways in transparent mode.
        // connectTelnet writes the RTU frame unchanged; connectTcpRTUBuffered
        // would instead rewrap it as MBAP (i.e. plain Modbus TCP), which is
        // not RTU over TCP.
        await this._modbus.connectTelnet(host, { port: tcpOptions.port })
      } else {
        await this._modbus.connectRTUBuffered(com, {
          baudRate: Number(rtuOptions.baudRate),
          dataBits: rtuOptions.dataBits,
          stopBits: rtuOptions.stopBits,
          parity: rtuOptions.parity
        })
      }

      if (generation !== this._generation) {
        // The last client left while this one was opening. `close` is what
        // takes modbus-serial's relay off the port, so the port that just
        // opened goes quiet as well as shut. Awaited, because the next connect
        // opens the same path and a serial port that is still closing refuses
        // it: `_openInFlight` is cleared in the `finally` below, so what this
        // waits for is what that flag promises.
        await new Promise<void>((resolve) => {
          const giveUp = setTimeout(resolve, 5000)
          this._modbus.close(() => {
            clearTimeout(giveUp)
            resolve()
          })
        })
        return
      }

      if (reconnect) {
        this._emitMessage({
          message: `Reconnected over ${PROTOCOL_LABELS[protocol]}`,
          variant: 'success',
          error: null
        })
        for (const client of this._clients) client.reconnected()
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
      this._setConnectState('connected')
    } catch (error) {
      if (generation !== this._generation) return
      const port = protocol === 'ModbusRtu' ? com : undefined
      const reason = humanizeSerialError(error as Error, port)
      // A failed reconnect is one attempt of the burst, not the end of it: a
      // pulled USB cable fails every open until it is plugged back in, and no
      // `close` follows a failed open to schedule the next one.
      this._emitMessage({ message: reason, variant: 'error', error })
      if (reconnect) {
        this._emitMessage({
          message: `Reconnecting (${this._consecutiveReconnects + 1}/${this._maxConsecutiveReconnects})...`,
          variant: 'warning',
          error: null
        })
        this._scheduleReconnect()
        return
      }
      this._closeForEveryone()
    } finally {
      this._openInFlight = false
      this._idleWhenDone()
    }
  }

  //
  //
  // Disconnect
  /** No reconnect after this, and none of a burst's timers left running. */
  private _stopReconnecting = (): void => {
    this._shouldAutoReconnect = false
    this._generation++
    this._consecutiveReconnects = 0
    if (this._reconnectResetTimeout) clearTimeout(this._reconnectResetTimeout)
    if (this._reconnectTimeout) clearTimeout(this._reconnectTimeout)
    this._reconnectTimeout = undefined
  }

  /**
   * Close the open port, giving up on it after five seconds, and say how it
   * ended without saying it to anyone.
   *
   * `_closing` holds for as long as this runs, which is what `refuses` reads.
   */
  private _closePort = async (): Promise<'closed' | 'timed out' | { failed: unknown }> => {
    this._closing = true
    try {
      return await new Promise<'closed' | 'timed out'>((resolve) => {
        const giveUp = setTimeout(() => {
          const abandoned = this._modbus as ModbusRTUEmitter
          // What `destroy` leaves behind decides what this has to do itself.
          // It destroys a socket, and returns a serial port untouched:
          // `RTUBufferedPort` declares no `destroy`, so `ModbusRTU.destroy`
          // takes the branch that only calls back, keeping the port open and
          // its close relay on it. Taking the listeners off is what stops that
          // port speaking to the transport that replaces it, which it would do
          // as a connection lost on a connection that is fine.
          abandoned.removeAllListeners()
          // modbus-serial's `_onError` emits on the client, and `destroy`
          // leaves that relay on a serial port too, so a client with no
          // `error` listener left would take the main process down with an
          // unhandled `error` event the next time that port faults.
          abandoned.on('error', () => {})
          abandoned.destroy(() => resolve('timed out'))
        }, 5000)

        this._modbus.close(() => {
          clearTimeout(giveUp)
          resolve('closed')
        })
      })
    } catch (error) {
      return { failed: error }
    } finally {
      this._closing = false
    }
  }

  /**
   * Let go of a client that has moved to another connection, telling neither
   * it nor the user, and close this one in the background once nobody rides
   * it.
   *
   * `ModbusClient.connect` calls it for a client an `error` without a close
   * left here. The user asked for a connection elsewhere rather than for a
   * disconnect, so nothing about this one's close is theirs to read, and the
   * client has already stopped listening to it.
   */
  public release = (client: TransportClient): void => {
    if (!this._clients.delete(client) || this._clients.size > 0) return
    this._stopReconnecting()
    if (!this._modbus.isOpen) {
      this._modbus.destroy(() => {})
      this._idleWhenDone()
      return
    }
    void this._closePort().then(this._idleWhenDone)
  }

  /**
   * Stop riding this connection, and close it when nobody else rides it.
   *
   * `wasConnecting` is the client's own state before it asked, which decides
   * whether a port that is not open is worth a warning: a cancelled connect is
   * what the user asked for.
   */
  public detach = async (client: TransportClient, wasConnecting: boolean): Promise<void> => {
    if (!this._clients.delete(client)) {
      this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      client.transportClosed(this)
      return
    }

    if (this._clients.size > 0) {
      this._emitMessage({
        message: 'Disconnected from server',
        variant: 'default',
        error: null
      })
      client.transportClosed(this)
      return
    }

    const { protocol } = this._config
    this._stopReconnecting()

    if (!this._modbus.isOpen) {
      if (!wasConnecting) {
        this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      }
      this._modbus.destroy(() => {})
      client.transportClosed(this)
      this._idleWhenDone()
      return
    }

    const ending = await this._closePort()
    if (typeof ending === 'object') {
      // `ModbusRTU.close` threw where it stands. That leaves a port whose close
      // never started, which is a disconnect whatever the port went on to do.
      this._emitMessage({
        message: errorText(ending.failed),
        variant: 'error',
        error: ending.failed
      })
    } else {
      if (ending === 'timed out') {
        const message =
          protocol === 'ModbusRtu'
            ? 'Disconnect timeout, the port may stay open until Modbux closes'
            : 'Disconnect timeout, the connection was dropped'
        this._emitMessage({ message, variant: 'warning', error: null })
      }
      this._emitMessage({
        message: 'Disconnected from server',
        variant: 'default',
        error: null
      })
    }
    client.transportClosed(this)
    this._idleWhenDone()
  }
}
