import { DataBits, StartRtuServerParams, StopBits } from '@shared'
import { ServerSerial } from 'modbus-serial'
import { Windows } from '../../windows'
import { emitServerMessage } from './messages'
import { ServerRegistry } from './registry'
import { BROADCAST_UNIT_ID, createVector } from './vector'

/**
 * The serial port under a `ServerSerial`, with the events this file listens for.
 *
 * `serverserial.js` opens a `SerialPort` into `_serverPath` and returns it from
 * `getPort()`. `ServerSerial.d.ts` declares neither, so reaching the port needs
 * a type written here.
 */
interface RtuSerialPort {
  on(event: 'error' | 'close', listener: (err?: Error) => void): void
}

interface ServerSerialWithPort extends ServerSerial {
  getPort(): RtuSerialPort
}

/**
 * `ServerSerial`'s third constructor argument, which its typings leave out.
 *
 * `serverserial.js` builds its own option object out of `path`, `baudRate`,
 * `parity`, `debug`, `unitID` and `binding`, and assigns it over this one. So
 * these two reach `SerialPort` by no other route, and the options object the
 * typings do declare accepts them and drops them. Without them the binding
 * opens at its own defaults, `dataBits: 8` and `stopBits: 1`.
 */
interface ServerSerialPortOptions {
  dataBits: DataBits
  stopBits: StopBits
}

type ServerSerialConstructor = new (
  ...args: [...ConstructorParameters<typeof ServerSerial>, ServerSerialPortOptions]
) => ServerSerial

interface RtuServerParams {
  windows: Windows
  registry: ServerRegistry
}

/**
 * The one RTU server, which is a serial port and the uuid whose registers it
 * serves.
 *
 * There is one because RS-485 is one bus: a second `ServerSerial` on the same
 * adapter would answer over the first. `start` replaces what is running.
 */
export class RtuServer {
  private _windows: Windows
  private _registry: ServerRegistry

  private _server: ServerSerial | null = null
  private _uuid: string | null = null
  private _active: boolean = false
  private _generation: number = 0
  private _broadcastWarningSent: boolean = false

  constructor({ windows, registry }: RtuServerParams) {
    this._windows = windows
    this._registry = registry
  }

  /** Whether the RTU server is running, for a window that has to ask. */
  public get active(): boolean {
    return this._active
  }

  /** The uuid this server answers for, or null when none is running. */
  public get uuid(): string | null {
    return this._uuid
  }

  /**
   * Says once per RTU session that registers on unit 0 are unreachable.
   *
   * The renderer opens the port before it syncs registers, so on a fresh start
   * the data arrives after `initialized` and on a config load it is already
   * there. Hence the two call sites, and the flag that keeps them to one
   * message.
   */
  public warnBroadcastUnit(uuid: string): void {
    if (!this._active || this._uuid !== uuid) return
    if (this._broadcastWarningSent) return
    if (!this._registry.hostsUnit(uuid, BROADCAST_UNIT_ID)) return

    this._broadcastWarningSent = true
    emitServerMessage(this._windows, {
      message: 'Unit 0 is the broadcast address on RTU. Its registers cannot be read.',
      variant: 'warning'
    })
  }

  /**
   * Reports the RTU server down: the message, and the status the view reads.
   *
   * A generation that is not the current one belongs to a server `start` has
   * already replaced, and that server says nothing. An open still in flight
   * is what gets here: `stop` cannot close a port that never opened,
   * because `SerialPortStream.close` takes its `!isOpen` branch and answers
   * "Port is not open", so the open outlives the server it was started for.
   */
  private _reportDown(generation: number, message: string, error?: Error): void {
    if (generation !== this._generation) return
    this._active = false
    emitServerMessage(this._windows, { message, variant: 'error', error })
    this._windows.send('rtu_server_status', false, 'serverView')
  }

  /**
   * Starts an RTU server on a serial port for the given UUID.
   * Closes any existing RTU server first.
   */
  public start = async ({ uuid, serialConfig }: StartRtuServerParams): Promise<void> => {
    if (!serialConfig.com.trim()) return
    await this.stop()
    this._broadcastWarningSent = false
    const generation = ++this._generation

    try {
      // No unitID on purpose: passing one makes the library answer for that id
      // alone. Its default of 255 means "listen to all addresses", and the
      // vector filters, because only the vector knows which ids have data.
      this._server = new (ServerSerial as ServerSerialConstructor)(
        createVector(this._registry, uuid, 'rtu'),
        {
          path: serialConfig.com,
          baudRate: Number(serialConfig.options.baudRate),
          parity: serialConfig.options.parity ?? 'none',
          // `@serialport/stream`'s `_error` hands a failed open to this callback
          // when one is passed and emits `error` on the port when none is. The
          // same callback carries the success, with null in place of an error.
          openCallback: (err): void => {
            if (err) this._reportDown(generation, `RTU server error: ${err.message}`)
          }
        },
        {
          dataBits: serialConfig.options.dataBits,
          stopBits: serialConfig.options.stopBits
        }
      )
      this._uuid = uuid

      const serverPort = (this._server as ServerSerialWithPort).getPort()

      // A write to a port that is gone fails in `_write`, which disconnects the
      // stream and calls back with the error, and a Writable given an error
      // emits it. A failed open arrives in `openCallback` instead.
      serverPort.on('error', (err) => {
        this._reportDown(generation, `RTU server error: ${err?.message ?? err}`)
      })

      // `close` is the disconnect event. `@serialport/stream` documents it as
      // "in the case of a disconnect it will be called with a Disconnect Error
      // object", and its `_disconnected` answers a failed read with
      // `close(undefined, new DisconnectedError(...))` while pushing nothing
      // into the stream. So an adapter pulled between requests arrives here
      // and nowhere else, and without this the view keeps showing a server
      // whose port is gone.
      serverPort.on('close', (err) => {
        // A close this process caused is already reported. `stop` clears
        // `_active` before it closes the port, and the `error` listener above
        // clears it for the write path, where one unplug emits both events. A
        // replaced server is refused on its generation instead.
        if (!this._active) return
        this._reportDown(generation, `RTU server disconnected from ${serialConfig.com}`, err)
      })

      this._server.on('initialized', () => {
        // A server that has already been replaced does not get to say it is up.
        if (generation !== this._generation) return
        this._active = true
        emitServerMessage(this._windows, {
          message: `RTU server started on ${serialConfig.com}`,
          variant: 'success'
        })
        this._windows.send('rtu_server_status', true, 'serverView')
        this.warnBroadcastUnit(uuid)
      })

      // `socketError`, not `error`. `serverserial.js` emits `error` only from
      // `sockWriter`'s `if (err)`, and the only caller of `sockWriter` is
      // `_callbackFactory`, which passes null on both of its branches: it has
      // turned the error into an exception frame by then. `socketError` is what
      // a failure of the pipe under the server emits.
      this._server.on('socketError', (err) => {
        this._reportDown(generation, `RTU server error: ${err?.message ?? err}`)
      })
    } catch (err) {
      emitServerMessage(this._windows, {
        message: `Failed to start RTU server: ${(err as Error)?.message ?? err}`,
        variant: 'error'
      })
    }
  }

  /**
   * Stops the active RTU server if one is running.
   */
  public stop = async (): Promise<void> => {
    if (!this._server) return
    const server = this._server
    const wasActive = this._active
    this._server = null
    this._uuid = null
    this._active = false
    this._generation++
    this._broadcastWarningSent = false
    this._windows.send('rtu_server_status', false, 'serverView')
    if (wasActive) {
      emitServerMessage(this._windows, { message: 'RTU server stopped', variant: 'warning' })
    }
    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    } catch (err) {
      const error = err as Error
      // "Port is not open" is expected when the serial port never connected — ignore silently
      if (error?.message?.includes('Port is not open')) return
      console.error('Error closing RTU server:', error?.message, error?.stack)
      emitServerMessage(this._windows, {
        message: `Error closing RTU server: ${error?.message ?? err}`,
        variant: 'error',
        error
      })
    }
  }
}
