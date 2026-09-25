import {
  MAX_REGISTER_ADDRESS,
  McpToolArgs,
  clientOwner,
  maxReadQuantity,
  maxUnitId,
  registersFrom,
  unitIdOutOfRange
} from '@shared'
import { getSelectedClient } from '@renderer/context/client.zustand'
import { useScanRegistersZustand } from '@renderer/components/client/ScanRegisters/scanRegisters.zustand'
import { startRegisterScan } from '@renderer/components/client/ScanRegisters/startRegisterScan'
import { useScanUnitIdZustand } from '@renderer/components/client/ScanUnitIds/scanUnitIds.zustand'
import { startUnitIdScan } from '@renderer/components/client/ScanUnitIds/startUnitIdScan'
import { actAndSettle, requireConnected, selectClient, stateOf } from './operateTools'
import { McpToolError } from './readTools'

/**
 * How long a scan tool waits for main to say the scan started or stopped.
 * Under the relay's 5 s, so the tool answers rather than the relay's timeout.
 */
const SCAN_SETTLE_MS = 3000

/**
 * How long the dialog shows what the tool filled in before the scan starts.
 * A scan of a few unit ids ends before a person looking at the screen sees
 * the dialog, let alone its progress bar.
 */
const DIALOG_PAUSE_MS = 500

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Why main would refuse a scan of this client. A poll refuses it too, which
 * the Start buttons do not yet: they stop the poll.
 */
const refuseScan = (client: string): void => {
  requireConnected(client)
  const state = stateOf(client)
  if (state.polling) throw new McpToolError('Cannot scan during a poll; stop_polling first')
  const owner = clientOwner(state)
  if (owner) throw new McpToolError(`Cannot scan during ${owner}`)
}

export const scanUnitIds = async ({
  client,
  ...fields
}: McpToolArgs<'scan_unit_ids'>): Promise<unknown> => {
  selectClient(client)
  refuseScan(client)
  const dialog = useScanUnitIdZustand.getState()
  const startUnitId = fields.startUnitId ?? dialog.startUnitId
  const count = fields.count ?? dialog.count
  const address = fields.address ?? dialog.address
  const length = fields.length ?? dialog.length
  const registerTypes = fields.registerTypes ?? dialog.registerTypes
  const timeout = fields.timeout ?? dialog.timeout

  const { protocol } = getSelectedClient().connectionConfig
  const lastUnitId = maxUnitId(protocol)
  if (startUnitId > lastUnitId) {
    throw new McpToolError(`The last unit id ${protocol} addresses is ${lastUnitId}`)
  }
  if (registerTypes.length === 0) throw new McpToolError('Name at least one register type')
  const maxLength = Math.min(maxReadQuantity(registerTypes), registersFrom(address))
  if (length > maxLength) {
    throw new McpToolError(
      `A read of these register types from ${address} takes at most ${maxLength}`
    )
  }

  dialog.setStartUnitId(String(startUnitId))
  dialog.setCount(String(count))
  dialog.setAddress(String(address))
  dialog.setLength(String(length))
  dialog.setRegisterTypes(registerTypes)
  dialog.setTimeout(String(timeout))
  // One scan dialog at a time.
  useScanRegistersZustand.getState().setOpen(false)
  dialog.setOpen(true)
  await pause(DIALOG_PAUSE_MS)

  const heard = await actAndSettle(
    client,
    () => Promise.resolve(startUnitIdScan()),
    (states) => states.some((state) => state.scanningUnitIds),
    SCAN_SETTLE_MS
  )
  return {
    started: heard.some((state) => state.scanningUnitIds),
    range: [startUnitId, Math.min(lastUnitId, startUnitId + count - 1)]
  }
}

export const scanRegisters = async ({
  client,
  ...fields
}: McpToolArgs<'scan_registers'>): Promise<unknown> => {
  selectClient(client)
  refuseScan(client)
  const outOfRange = unitIdOutOfRange(getSelectedClient().connectionConfig)
  if (outOfRange) throw new McpToolError(outOfRange)
  const dialog = useScanRegistersZustand.getState()
  const address = fields.address ?? dialog.address
  const length = fields.length ?? dialog.scanLength
  const chunkSize = fields.chunkSize ?? dialog.chunkSize
  const timeout = fields.timeout ?? dialog.timeout

  const { type } = getSelectedClient().registerConfig
  const maxChunk = maxReadQuantity([type])
  if (chunkSize > maxChunk) {
    throw new McpToolError(`One read of ${type} answers at most ${maxChunk}`)
  }

  dialog.setAddress(String(address))
  dialog.setScanLength(String(length))
  dialog.setChunkSize(String(chunkSize))
  dialog.setTimeout(String(timeout))
  useScanUnitIdZustand.getState().setOpen(false)
  dialog.setOpen(true)
  await pause(DIALOG_PAUSE_MS)

  // The scan answers when it ends; the tool answers when it has begun.
  let scan: Promise<void> = Promise.resolve()
  const heard = await actAndSettle(
    client,
    () => {
      scan = startRegisterScan()
      return Promise.resolve()
    },
    (states) => states.some((state) => state.scanningRegisters),
    SCAN_SETTLE_MS
  )
  scan.catch((error) => console.error('The register scan failed:', error))
  return {
    started: heard.some((state) => state.scanningRegisters),
    type,
    addressRange: [address, Math.min(MAX_REGISTER_ADDRESS, address + length - 1)]
  }
}

export const stopScan = async ({ client }: McpToolArgs<'stop_scan'>): Promise<unknown> => {
  selectClient(client)
  const { scanningUnitIds, scanningRegisters } = stateOf(client)
  if (!scanningUnitIds && !scanningRegisters) throw new McpToolError('The client is not scanning')
  await actAndSettle(
    client,
    () =>
      scanningUnitIds
        ? window.api.stopScanningUnitIds(client)
        : window.api.stopScanningRegisters(client),
    (states) => {
      const last = states.at(-1)
      return last !== undefined && !last.scanningUnitIds && !last.scanningRegisters
    },
    SCAN_SETTLE_MS
  )
  const state = stateOf(client)
  return { scanning: state.scanningUnitIds || state.scanningRegisters }
}
