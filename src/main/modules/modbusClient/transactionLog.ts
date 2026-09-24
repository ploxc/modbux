import { RawTransaction, Transaction } from '@shared'
import { DateTime } from 'luxon'
import ModbusRTU from 'modbus-serial'
import { v4 } from 'uuid'
import { Windows } from '../../windows'

/** Modbus frames read the way a protocol analyser prints them. */
const toHexString = (bytes: Uint8Array | undefined): string =>
  bytes === undefined
    ? ''
    : Array.from(bytes)
        .map((byte) => Number(byte).toString(16).toUpperCase().padStart(2, '0'))
        .join(' ')

/**
 * The two internals the transaction log reads.
 *
 * `ModbusRTU.d.ts` declares neither, so both arrive untyped and the shape is
 * written here. `_transactions` is the table every request is filed in, and
 * `_port._transactionIdWrite` is the key the next one files under.
 *
 * `_port` is optional because a client built but not connected has none, and
 * every request passes `_connectedTransport` first, which a client without one
 * does not. `_transactionIdWrite` is optional because a serial port and a
 * telnet port have none until `open` sets it. A request waits its turn after
 * `_connectedTransport` let it in, and the connection can drop or be replaced
 * by a reconnect before the turn comes, so the key is whatever the port there
 * holds then. A request that fails before it goes out files nothing under it,
 * and `log` finds nothing.
 */
interface ModbusRTUInternals extends ModbusRTU {
  _transactions: Record<string, RawTransaction | undefined>
  _port: { _transactionIdWrite?: number } | undefined
}

/**
 * The data address the request asked for.
 *
 * Read off the request frame, not off `nextDataAddress`. modbus-serial files
 * that field on two of its twelve transaction records, inside `writeFC4` and
 * `writeFC6`, and `writeFC1` delegates to `writeFC2` while `writeFC3`
 * delegates to `writeFC4`. So FC3, FC4 and FC6 carry one and FC1, FC2, FC5,
 * FC15 and FC16 do not, and the Addr column was blank for every coil read,
 * every discrete input read and every write Modbux sends.
 *
 * Every `writeFCx` builds its frame as unit id, function code, then the data
 * address at offset 2 as a big-endian word: measured over FC2, FC4, FC5, FC6,
 * FC15 and FC16, which is every code Modbux sends. `request` is stashed by
 * `_writeBufferToPort` while debug mode is on, and `Transport._open` sets
 * `isDebugEnabled` on every client it opens, so a frame that went out over a
 * connection Modbux made has one. `nextDataAddress` is the fallback either way.
 */
const requestedAddress = (rawTransaction: RawTransaction): number | undefined => {
  const request = rawTransaction.request
  if (request && request.length >= 4) return request.readUInt16BE(2)
  return rawTransaction.nextDataAddress
}

interface TransactionLogParams {
  client: ModbusRTU
  windows: Windows
}

/**
 * What went out and what came back, read off modbus-serial's own table.
 *
 * It reads two undeclared internals, which is what a library bump breaks.
 */
export class TransactionLog {
  private _client: ModbusRTU
  private _windows: Windows

  constructor({ client, windows }: TransactionLogParams) {
    this._client = client
    this._windows = windows
  }

  // The key is a transaction id on TCP and UDP, whose ports write it into the
  // MBAP header and increment it per request. A serial port has none: RTU
  // frames carry no transaction id, and `rtubufferedport.js` never names
  // `_transactionIdWrite`. `open` sets it to 1 for every transport
  // (`index.js:679`), so every serial request files under the key 1 and the
  // next one lands on top of the last. It is a map key, not a number.
  private _internals = (): ModbusRTUInternals => this._client as ModbusRTUInternals

  /**
   * The key modbus-serial files the next request under.
   *
   * A `writeFCx` reads `_port._transactionIdWrite` to file its transaction and
   * the port increments it once the buffer is out, so this is the key of the
   * request that goes next. Read it immediately before the call: nothing awaits
   * in between, so nothing else can file first.
   */
  public nextTransactionIdKey = (): string => String(this._internals()._port?._transactionIdWrite)

  /**
   * Log the request filed under `transactionIdKey`, and only that one.
   *
   * The caller names its own request because the table holds whatever earlier
   * requests were never logged out of it. Taking the last entry instead logged
   * one caller's frame as another's and deleted the entry that caller was
   * still waiting on.
   *
   * On a serial port that key is 1 for every request, so naming it
   * discriminates nothing and the delete below would take an entry still in
   * flight. What keeps them apart there is that there is only ever one:
   * `Transport.request` files, awaits and logs a request inside one turn of
   * the queue every client on the connection waits in.
   */
  public log = (uuid: string, transactionIdKey: string, errorMessage: string | undefined): void => {
    const rawTransactions = this._internals()._transactions
    const rawTransaction = rawTransactions[transactionIdKey]
    if (!rawTransaction) return

    // Only the entry being logged, so the same one is not logged again on the
    // next call. Emptying the table takes entries for requests still in flight
    // with it, and `_onReceive` drops a response whose entry is gone, so the
    // request times out rather than resolving.
    delete rawTransactions[transactionIdKey]

    const transaction: Transaction = {
      id: `${transactionIdKey}__${v4()}`,
      timestamp: DateTime.now().toMillis(),
      unitId: rawTransaction.nextAddress,
      address: requestedAddress(rawTransaction),
      code: rawTransaction.nextCode,
      responseLength: rawTransaction.nextLength,
      timeout: rawTransaction._timeoutFired,
      request: toHexString(rawTransaction.request),
      responses: (rawTransaction.responses ?? []).map(toHexString),
      errorMessage
    }

    this._windows.send('transaction', { uuid, transaction }, 'main')
  }
}
