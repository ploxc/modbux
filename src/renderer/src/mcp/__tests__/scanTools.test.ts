// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_CLIENT_UUID, defaultClientState } from '@shared'
import { ApiCall, recordApiCalls, stubRenderer } from '@renderer/context/__tests__/stubRenderer'

// The stores ask `window.api` as they load, so the stub goes first.
stubRenderer()
const calls: ApiCall[] = []
recordApiCalls(calls)

/**
 * The events main puts out for a call, delivered after its answer, one task
 * each, which is the order the renderer hears them in.
 */
const eventsAfter = new Map<string, Array<() => void>>()
const answering = window.api as unknown as Record<string, unknown>
window.api = new Proxy(
  {},
  {
    get: (_target, method: string): unknown => {
      const answer = answering[method]
      if (typeof answer !== 'function') return answer
      return async (payload: unknown): Promise<unknown> => {
        const answered: unknown = await (answer as (payload: unknown) => unknown)(payload)
        for (const [i, event] of (eventsAfter.get(method) ?? []).entries()) setTimeout(event, i)
        return answered
      }
    }
  }
) as never
const { answerCall } = await import('../relay')
const { useClientZustand } = await import('@renderer/context/client.zustand')
const { useLiveZustand } = await import('@renderer/context/live.zustand')
const { useScanUnitIdZustand } =
  await import('@renderer/components/client/ScanUnitIds/scanUnitIds.zustand')
const { useScanRegistersZustand } =
  await import('@renderer/components/client/ScanRegisters/scanRegisters.zustand')

const client = MAIN_CLIENT_UUID

/** The answer of a tool call, or the error it gave, thrown. */
const run = async (
  tool: Parameters<typeof answerCall>[0]['tool'],
  args: object
): Promise<unknown> => {
  const answer = await answerCall({ id: 'call', tool, args })
  if (!answer.ok) throw new Error(answer.error)
  return answer.result
}

const setState = (state: Partial<typeof defaultClientState>): void =>
  useLiveZustand.getState().setClientState(client, { ...defaultClientState, ...state })

const connected = (state: Partial<typeof defaultClientState> = {}): void =>
  setState({ connectState: 'connected', ...state })

const sent = (method: string): unknown[] =>
  calls.filter((call) => call.method === method).map((call) => call.payload)

beforeEach(async () => {
  calls.length = 0
  eventsAfter.clear()
  setState({})
  await useClientZustand.getState().init()
  await useClientZustand.getState().setProtocol('ModbusTcp')
  await useClientZustand.getState().setUnitId('0')
  await useClientZustand.getState().setType('holding_registers')
  useScanUnitIdZustand.setState({
    open: false,
    address: 0,
    length: 2,
    startUnitId: 0,
    count: 10,
    registerTypes: ['holding_registers'],
    timeout: 500
  })
  useScanRegistersZustand.setState({
    open: false,
    address: 0,
    scanLength: 10000,
    chunkSize: 100,
    timeout: 500
  })
  calls.length = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('scan_unit_ids', () => {
  it('opens the dialog with what it was given, asks main, and answers once the scan runs', async () => {
    connected()
    eventsAfter.set('scanUnitIds', [(): void => connected({ scanningUnitIds: true })])

    const answer = await run('scan_unit_ids', {
      client,
      startUnitId: 1,
      count: 5,
      registerTypes: ['coils', 'holding_registers'],
      timeout: 200
    })

    expect(answer).toEqual({ started: true, range: [1, 5] })
    expect(useScanUnitIdZustand.getState()).toMatchObject({
      open: true,
      startUnitId: 1,
      count: 5,
      address: 0,
      length: 2,
      registerTypes: ['coils', 'holding_registers'],
      timeout: 200
    })
    expect(sent('scanUnitIds')).toEqual([
      {
        uuid: client,
        parameters: {
          address: 0,
          length: 2,
          range: [1, 5],
          registerTypes: ['coils', 'holding_registers'],
          timeout: 200
        }
      }
    ])
  })

  it('ends the range at the last unit id the protocol addresses', async () => {
    connected()
    eventsAfter.set('scanUnitIds', [(): void => connected({ scanningUnitIds: true })])
    const answer = await run('scan_unit_ids', { client, startUnitId: 250, count: 20 })
    expect(answer).toMatchObject({ range: [250, 255] })
  })

  it('refuses a start past the last unit id RTU addresses, and asks main nothing', async () => {
    await useClientZustand.getState().setProtocol('ModbusRtu')
    connected()
    await expect(run('scan_unit_ids', { client, startUnitId: 248 })).rejects.toThrow(
      'The last unit id ModbusRtu addresses is 247'
    )
    expect(sent('scanUnitIds')).toEqual([])
    expect(useScanUnitIdZustand.getState().open).toBe(false)
  })

  it('takes a start at the last unit id RTU addresses', async () => {
    await useClientZustand.getState().setProtocol('ModbusRtu')
    connected()
    eventsAfter.set('scanUnitIds', [(): void => connected({ scanningUnitIds: true })])
    expect(await run('scan_unit_ids', { client, startUnitId: 247 })).toMatchObject({
      range: [247, 247]
    })
  })

  // The strictest type selected bounds the length, and so does the last address.
  it.each([
    [{ registerTypes: ['coils', 'holding_registers'], length: 126 }, 125],
    [{ registerTypes: ['coils'], address: 65535, length: 2 }, 1]
  ])('refuses a length past what one read answers: %o', async (fields, most) => {
    connected()
    await expect(run('scan_unit_ids', { client, ...fields })).rejects.toThrow(`at most ${most}`)
    expect(sent('scanUnitIds')).toEqual([])
  })

  it('takes a length of exactly what one read answers', async () => {
    connected()
    eventsAfter.set('scanUnitIds', [(): void => connected({ scanningUnitIds: true })])
    await run('scan_unit_ids', { client, registerTypes: ['coils'], length: 2000 })
    expect(sent('scanUnitIds')).toMatchObject([{ parameters: { length: 2000 } }])
  })

  it('refuses while the client polls, naming the way out', async () => {
    connected({ polling: true })
    await expect(run('scan_unit_ids', { client })).rejects.toThrow('stop_polling first')
    expect(sent('scanUnitIds')).toEqual([])
    expect(sent('stopPolling')).toEqual([])
  })

  it('refuses while the client reads, and while it is not connected', async () => {
    connected({ reading: true })
    await expect(run('scan_unit_ids', { client })).rejects.toThrow('during another read')
    setState({})
    await expect(run('scan_unit_ids', { client })).rejects.toThrow('not connected')
    expect(sent('scanUnitIds')).toEqual([])
  })

  it('answers not started when main says nothing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    connected()
    const answer = run('scan_unit_ids', { client })
    await vi.advanceTimersByTimeAsync(3000)
    expect(await answer).toMatchObject({ started: false })
  })
})

describe('scan_registers', () => {
  it('opens the dialog, empties the grid, asks main, and answers once the scan runs', async () => {
    connected()
    useLiveZustand.getState().setRegisterData(client, [
      {
        id: 0,
        buffer: new Uint8Array(2),
        hex: '0001',
        words: undefined,
        bit: false,
        isScanned: false
      }
    ])
    eventsAfter.set('scanRegisters', [(): void => connected({ scanningRegisters: true })])

    const answer = await run('scan_registers', { client, address: 60000, length: 10000 })

    expect(answer).toEqual({
      started: true,
      type: 'holding_registers',
      addressRange: [60000, 65535]
    })
    expect(useScanRegistersZustand.getState()).toMatchObject({
      open: true,
      address: 60000,
      scanLength: 10000,
      chunkSize: 100
    })
    expect(useLiveZustand.getState().clients[client]?.registerData).toEqual([])
    expect(sent('scanRegisters')).toEqual([
      {
        uuid: client,
        parameters: { addressRange: [60000, 65535], length: 100, timeout: 500 }
      }
    ])
  })

  it('refuses a chunk past what one read of the register type answers', async () => {
    connected()
    await expect(run('scan_registers', { client, chunkSize: 126 })).rejects.toThrow(
      'One read of holding_registers answers at most 125'
    )
    expect(sent('scanRegisters')).toEqual([])
  })

  it('takes a chunk of exactly what one read answers', async () => {
    connected()
    eventsAfter.set('scanRegisters', [(): void => connected({ scanningRegisters: true })])
    await run('scan_registers', { client, chunkSize: 125 })
    expect(sent('scanRegisters')).toMatchObject([{ parameters: { length: 125 } }])
  })

  // A unit id taken under TCP stays when the protocol moves to RTU.
  it('refuses a unit id the protocol does not address, and asks main nothing', async () => {
    await useClientZustand.getState().setUnitId('250')
    await useClientZustand.getState().setProtocol('ModbusRtu')
    connected()
    await expect(run('scan_registers', { client })).rejects.toThrow('stops at 247')
    expect(sent('scanRegisters')).toEqual([])
  })

  it('refuses while the client polls, and during a unit id scan', async () => {
    connected({ polling: true })
    await expect(run('scan_registers', { client })).rejects.toThrow('stop_polling first')
    connected({ scanningUnitIds: true })
    await expect(run('scan_registers', { client })).rejects.toThrow('during a unit id scan')
    expect(sent('scanRegisters')).toEqual([])
  })
})

describe('stop_scan', () => {
  it('stops a unit id scan and answers once main says it ended', async () => {
    connected({ scanningUnitIds: true })
    eventsAfter.set('stopScanningUnitIds', [(): void => connected()])
    expect(await run('stop_scan', { client })).toEqual({ scanning: false })
    expect(sent('stopScanningUnitIds')).toEqual([client])
    expect(sent('stopScanningRegisters')).toEqual([])
  })

  it('stops a register scan', async () => {
    connected({ scanningRegisters: true })
    eventsAfter.set('stopScanningRegisters', [(): void => connected()])
    expect(await run('stop_scan', { client })).toEqual({ scanning: false })
    expect(sent('stopScanningRegisters')).toEqual([client])
    expect(sent('stopScanningUnitIds')).toEqual([])
  })

  it('refuses when nothing scans', async () => {
    connected({ polling: true })
    await expect(run('stop_scan', { client })).rejects.toThrow('not scanning')
  })
})
