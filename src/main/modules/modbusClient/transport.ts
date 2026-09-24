import ModbusRTU from 'modbus-serial'
import {
  BackendMessage,
  ConnectionConfig,
  ConnectState,
  PROTOCOL_LABELS,
  humanizeSerialError,
  serialLine
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
}

/** Who a request is for, which the connection it shares knows nothing of. */
export interface RequestTarget {
  /** The client that sent it, which its transaction is logged under. */
  uuid: string
  unitId: number
  timeout: number
  /**
   * Whether that client is still on the ride it queued the request on, which
   * a disconnect or a drop ends.
   */
  current: () => boolean
}

/**
 * The `removeAllListeners` under a `ModbusRTU`, and its port.
 *
 * `index.js` has the class extend `EventEmitter`, and `ModbusRTU.d.ts` declares
 * `on` and nothing else of the emitter, so taking listeners off again needs a
 * type written here. Nothing inside modbus-serial listens on the client object,
 * so what comes off is what this file put on.
 *
 * `_port` is what every `connect*` assigns before it opens, and it is absent
 * where a port constructor threw first, as a serial one does on an empty path.
 * A TCP and a telnet port have a `destroy` that destroys the socket; a serial
 * port has none.
 */
interface ModbusRTUEmitter extends ModbusRTU {
  removeAllListeners(): void
  _port:
    | {
        destroy?: (callback: () => void) => void
        _client?: { once: (event: 'close', listener: () => void) => unknown }
      }
    | undefined
}

/** How a close ended: closed, let go of after five seconds, or thrown. */
type CloseEnding = 'closed' | 'timed out' | { failed: unknown }

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

  /**
   * Rejects the request on the wire. The last client's detach calls it, because
   * no client is left to hear its answer and `close` takes the reply listener
   * off anyway, and so does `lost`, because the answer went with the
   * connection.
   *
   * modbus-serial's `destroy` clears the timeout of every pending transaction
   * and never calls it back, so a request it caught would never settle: the
   * client's `reading` or `writing` would stay set until Modbux restarts.
   */
  private _abandonInFlight: ((reason: Error) => void) | undefined

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
        // Said and nothing more. A port that closes after it says what the
        // close does, and one that is gone without closing is found by the
        // next request, which calls `lost`.
        this._emitMessage({
          message: errorText(error) || 'Connection error',
          variant: 'error',
          error: error
        })
      })
      .on('close', () => {
        // A close after a disconnect or after a burst that gave up is one
        // nobody rides any more, and modbus-serial takes its close relay off
        // the port inside `close()`, so the close `detach` asks for reaches
        // no handler. Measured on 8.0.25 over TCP, over a socat pty and on an
        // Arduino's USB serial port.
        if (this._shouldAutoReconnect) this.lost()
      })
  }

  /**
   * The connection is gone while clients ride it, so the burst puts them on
   * connecting and reconnects, or lets them go when it has no attempt left.
   *
   * Three things say so: the port's close, the close of the socket under a
   * TCP port, which `_hearTheSocketClose` listens to because `ModbusRTU` does
   * not relay it, and a request that finds the port shut under a connected
   * state. A serial port reads shut while its close is still on its way, so
   * the request can come before the close. Whichever comes later finds the burst under way, or, once the
   * reconnect has opened a new port, finds the port open: a close relayed
   * from the port it replaced, which modbus-serial leaves listening. Neither
   * adds anything.
   */
  public lost = (): void => {
    if (this._reconnectTimeout || this._openInFlight || this._modbus.isOpen) return
    // The connection this timer vouched for is gone. Left running, it would
    // zero the count in the middle of the burst that follows, and the burst
    // would run past its limit.
    clearTimeout(this._reconnectResetTimeout)
    // The reply to the request on the wire went with the connection, and every
    // request queued behind it would wait out its timeout rather than the
    // reconnect.
    this._abandonInFlight?.(new Error('Connection lost'))
    this._scheduleReconnect(true)
  }

  /**
   * Call `lost` when the socket of the port just opened closes.
   *
   * A TCP reset closes the socket, and modbus-serial 8.0.25 emits nothing for
   * it: `tcpport.js` sets `openFlag` false on the socket's error, and its
   * close handler then finds the flag false and stays quiet (their issue
   * #591). Without this, the drop is found by the next request instead, and
   * whether the burst gives up then depends on how late that request comes.
   * `_client` is private to modbus-serial, so a bump of it has to be checked
   * against the test that resets the socket.
   *
   * A serial port and a telnet port relay their close to `ModbusRTU`, so
   * `lost` hears it twice there, and adds nothing the second time. A socket a
   * reconnect has replaced finds the port open, and `lost` ignores it.
   */
  private _hearTheSocketClose = (): void => {
    const port = (this._modbus as ModbusRTUEmitter)._port
    port?._client?.once('close', () => {
      if (this._shouldAutoReconnect) this.lost()
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
   *
   * A turn that comes up once its client is no longer on the ride it was
   * queued on is refused rather than sent: after a disconnect it would reach
   * the device once that user was told they were disconnected.
   */
  public request = <Result>(
    { uuid, unitId, timeout, current }: RequestTarget,
    send: (modbus: ModbusRTU) => Promise<Result>
  ): Promise<Result> =>
    this._run(async (modbus) => {
      if (!current()) throw new Error('Connection closed')
      modbus.setID(unitId)
      modbus.setTimeout(timeout)
      const transactionIdKey = this._transactionLog.nextTransactionIdKey()
      try {
        const result = await new Promise<Result>((resolve, reject) => {
          this._abandonInFlight = reject
          send(modbus).then(resolve, reject)
        })
        this._transactionLog.log(uuid, transactionIdKey, undefined)
        return result
      } catch (error) {
        this._transactionLog.log(uuid, transactionIdKey, errorText(error))
        throw error
      } finally {
        this._abandonInFlight = undefined
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
   * Whether `client` on `config` may not ride this connection, having said why.
   *
   * A close that is still closing, or a cancelled open that is still opening,
   * holds the port the next open would ask for. A serial port that other
   * clients ride is open at their line settings, and a client on other ones
   * would talk past every device on the bus; a client that rides it already is
   * on the line it is open at. `attach` asks it, and
   * `ModbusClient.connect` asks it first as well, because a refused connect
   * keeps the client on the transport it rode.
   */
  public refuses = (client: TransportClient, config: ConnectionConfig): boolean => {
    const message = this._refusal(client, config)
    if (message === undefined) return false
    this._emitMessage({ message, variant: 'warning', error: null })
    return true
  }

  private _refusal = (client: TransportClient, config: ConnectionConfig): string | undefined => {
    if (this._closing) return 'Still closing that connection, try again in a moment'
    if (this._openInFlight && this._clients.size === 0) {
      return 'Still finishing the connect you cancelled'
    }
    if (this._clients.size === 0 || this._clients.has(client)) return undefined
    if (config.protocol !== 'ModbusRtu') return undefined
    const open = serialLine(this._config.rtu.options)
    if (serialLine(config.rtu.options) === open) return undefined
    return `${this._config.rtu.com} is open at ${open} for another client. Use the same serial settings to share it`
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
    if (this.refuses(client, config)) return

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
    // Riders on a port that is shut with nothing reopening it are on a
    // connection whose close has not reached `lost` yet, and that is the burst's for all of them rather than a fresh open. The
    // count starts again, because a Connect is a user asking: a burst that
    // reached its limit would otherwise let every rider go with no attempt.
    if (this._clients.size > 1) {
      this._consecutiveReconnects = 0
      this.lost()
      return
    }
    this._config = structuredClone(config)
    await this._open(false)
  }

  // --- Auto-reconnect logic ---
  /**
   * Announce the next attempt of the burst and schedule it, or give up once
   * the burst has made as many as it may.
   *
   * The count is asked before it goes up, so every attempt announced is an
   * attempt made. `afterDrop` is whether `lost` called it rather than a failed
   * reopen, whose `_open` has put the clients on connecting already. A drop is
   * said even when the burst has no attempt left.
   */
  private _scheduleReconnect = (afterDrop: boolean): void => {
    if (this._consecutiveReconnects >= this._maxConsecutiveReconnects) {
      this._shouldAutoReconnect = false
      this._emitMessage({
        message: afterDrop
          ? 'Connection lost, too many consecutive reconnect attempts, giving up'
          : 'Too many consecutive reconnect attempts, giving up',
        variant: 'error',
        error: null
      })
      this._closeForEveryone()
      return
    }

    this._consecutiveReconnects++
    this._emitMessage({
      message: `${afterDrop ? 'Connection lost, reconnecting' : 'Reconnecting'} (${this._consecutiveReconnects}/${this._maxConsecutiveReconnects})...`,
      variant: 'warning',
      error: null
    })
    if (afterDrop) this._setConnectState('connecting')
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
        await this._closeOrAbandon()
        return
      }

      if (reconnect) {
        this._emitMessage({
          message: `Reconnected over ${PROTOCOL_LABELS[protocol]}`,
          variant: 'success',
          error: null
        })
      } else {
        this._emitMessage({
          message: `Connected over ${PROTOCOL_LABELS[protocol]}`,
          variant: 'success',
          error: null
        })
      }

      this._hearTheSocketClose()
      if (this._reconnectResetTimeout) clearTimeout(this._reconnectResetTimeout)
      this._reconnectResetTimeout = setTimeout(() => {
        this._consecutiveReconnects = 0
      }, 10000)
      this._setConnectState('connected')
    } catch (error) {
      // tcpport's connect `timeout` calls back and leaves its socket dialling,
      // so a host that answers later would hold a connection nobody closes.
      // The port's own `destroy` takes that socket; `ModbusRTU.destroy` would
      // also clear the timeout of a request a drop left on the wire.
      ;(this._modbus as ModbusRTUEmitter)._port?.destroy?.(() => {})
      if (generation !== this._generation) return
      const port = protocol === 'ModbusRtu' ? com : undefined
      const reason = humanizeSerialError(error as Error, port)
      // A failed reconnect schedules the burst's next attempt itself, or gives
      // up when it has none left: a pulled USB cable fails every open until it
      // is plugged back in, and no `close` follows a failed open.
      this._emitMessage({ message: reason, variant: 'error', error })
      if (reconnect) {
        this._scheduleReconnect(false)
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
   * Let go of the port for good: nothing it says reaches the transport again,
   * and `destroy` takes the socket.
   */
  private _abandonPort = (callback: () => void): void => {
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
    abandoned.destroy(callback)
  }

  /**
   * Close the port, and let go of it when the close has not finished five
   * seconds later, or when it throws.
   *
   * A close finishes when it calls back on a port that reads shut, whatever it
   * calls back with: a serial binding clears its descriptor before it closes,
   * so even a close that failed answers on a port that reads shut. Only a TCP
   * or telnet port answers while it reads open. tcpport calls its close back
   * with "TCP Connection Timed Out", and telnetport with "TelnetPort
   * Connection Timed Out.", when the socket's idle timer fires, which
   * counts from the last traffic rather than from the close, and again each
   * time traffic re-arms it: the peer has not answered the FIN yet, and may
   * never. Each such answer asks again, and the five seconds decide.
   */
  private _closeOrAbandon = (): Promise<CloseEnding> =>
    new Promise((resolve) => {
      let settled = false
      const settle = (ending: CloseEnding): void => {
        settled = true
        clearTimeout(giveUp)
        resolve(ending)
      }
      const letGo = (ending: CloseEnding): void => {
        settle(ending)
        this._abandonPort(() => {})
      }
      const giveUp = setTimeout(() => letGo('timed out'), 5000)
      const ask = (): void => {
        try {
          this._modbus.close(answered)
        } catch (error) {
          // A close that threw leaves nothing to wait for, so the port is let go
          // of now rather than after the five seconds.
          letGo({ failed: error })
        }
      }
      // An answer ahead of the give-up in the same turn queues this to run after
      // it, and a destroyed socket reads open until Node emits its `close`,
      // which runs after the immediate this is queued as. The port can also
      // shut between an answer and the next ask, with nobody's callback kept to
      // hear it.
      const askAgain = (): void => {
        if (settled) return
        if (this._modbus.isOpen) ask()
        else settle('closed')
      }
      const answered = (): void => {
        // Settled here rather than an immediate later, so a close that answers
        // on a port that reads shut ends in the same turn.
        if (!this._modbus.isOpen) settle('closed')
        // After the answer returns: tcpport empties its callback slot once the
        // callback has run, which would drop one kept from inside it.
        else setImmediate(askAgain)
      }
      ask()
    })

  /**
   * Close the open port, and say how it ended without saying it to anyone.
   *
   * `_closing` holds for as long as this runs, which is what `refuses` reads.
   */
  private _closePort = async (): Promise<CloseEnding> => {
    this._closing = true
    try {
      return await this._closeOrAbandon()
    } finally {
      this._closing = false
    }
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
    this._abandonInFlight?.(new Error('Connection closed'))

    if (!this._modbus.isOpen) {
      if (!wasConnecting) {
        this._emitMessage({ message: 'Already disconnected', variant: 'warning', error: null })
      }
      // Nothing is destroyed here. The port is shut, or still opening for a
      // connect the user cancelled, and `destroy` strands whatever waits on
      // it: over TCP it drops the open's callback, so `_openInFlight` never
      // clears, and it clears the timeout of the request a drop left on the
      // wire.
      client.transportClosed(this)
      this._idleWhenDone()
      return
    }

    const ending = await this._closePort()
    if (typeof ending === 'object') {
      // `ModbusRTU.close` threw, and the port has been let go of, which is a
      // disconnect whatever the port goes on to do.
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
