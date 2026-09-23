import { ConnectionConfig, transportKey } from '@shared'
import { Windows } from '../../windows'
import { Transport } from './transport'

/**
 * The connections main holds, one per `transportKey`.
 *
 * A transport stays listed until nothing rides it and nothing is opening or
 * closing it, not merely until its last client left: a cancelled open is still
 * opening after the cancel, and a close is still closing after the disconnect
 * was asked for. Handing the next connect a fresh transport in that window
 * would open the same serial path twice, so the next connect meets the old
 * one instead, and the old one refuses it.
 */
export class Transports {
  private _windows: Windows
  private _transports = new Map<string, Transport>()

  constructor(windows: Windows) {
    this._windows = windows
  }

  /** The transport a config opens, the one already listed under its key or a new one. */
  public acquire = (config: ConnectionConfig): Transport => {
    const key = transportKey(config)
    const listed = this._transports.get(key)
    if (listed) return listed

    const transport = new Transport({
      key,
      config,
      windows: this._windows,
      onIdle: (idle): void => {
        this._transports.delete(idle.key)
      }
    })
    this._transports.set(key, transport)
    return transport
  }
}
