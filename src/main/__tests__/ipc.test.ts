import { describe, it, expect, vi, beforeEach } from 'vitest'

const handle = vi.fn()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (...args: unknown[]): unknown => handle(...args),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  }
}))

import {
  AddRegisterParamsSchema,
  SetBooleanParametersSchema,
  WriteParametersSchema,
  type BackendMessage,
  type Windows
} from '@shared'
import { createIpcHandle } from '../ipc'

const createWindows = (): { windows: Windows; sent: BackendMessage[] } => {
  const sent: BackendMessage[] = []
  const windows = {
    send: (_event: string, payload: BackendMessage) => sent.push(payload)
  } as unknown as Windows
  return { windows, sent }
}

/** Invokes the listener that was registered for `channel`. */
const invoke = async (channel: string, payload?: unknown): Promise<unknown> => {
  const call = handle.mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`nothing registered for ${channel}`)
  return (call[1] as (e: unknown, p?: unknown) => unknown)({}, payload)
}

beforeEach(() => handle.mockClear())

describe('createIpcHandle', () => {
  it('registers an unguarded channel and passes the payload straight through', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('update_connection_config', listener)
    await invoke('update_connection_config', { unitId: 3 })

    expect(listener).toHaveBeenCalledWith({}, { unitId: 3 })
    expect(sent).toEqual([])
  })

  it('calls the listener when a guarded payload parses', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('set_bool', listener, SetBooleanParametersSchema)
    await invoke('set_bool', {
      uuid: 'server-1',
      unitId: '1',
      registerType: 'coils',
      address: 12,
      state: true
    })

    expect(listener).toHaveBeenCalledOnce()
    expect(sent).toEqual([])
  })

  it('never calls the listener when the payload is rejected', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('set_bool', listener, SetBooleanParametersSchema)
    // unitId 300 is not a Modbus unit id
    const returned = await invoke('set_bool', {
      uuid: 'server-1',
      unitId: '300',
      registerType: 'coils',
      address: 12,
      state: true
    })

    expect(listener).not.toHaveBeenCalled()
    expect(returned).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(sent[0].variant).toBe('error')
    expect(String(sent[0].error)).toContain('set_bool')
    expect(String(sent[0].error)).toContain('unitId')
  })

  it('reports rather than throws, so the renderer never sees a rejected invoke', async () => {
    const { windows } = createWindows()
    const ipcHandle = createIpcHandle(windows)

    ipcHandle('set_bool', vi.fn(), SetBooleanParametersSchema)
    await expect(invoke('set_bool', undefined)).resolves.toBeUndefined()
  })

  it('hands the listener the parsed payload, so unknown keys never reach the socket', async () => {
    const { windows } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('set_bool', listener, SetBooleanParametersSchema)
    await invoke('set_bool', {
      uuid: 'server-1',
      unitId: '1',
      registerType: 'coils',
      address: 12,
      state: true,
      __proto__polluted: 'nope',
      extra: 'stripped'
    })

    expect(listener.mock.calls[0][1]).toEqual({
      uuid: 'server-1',
      unitId: '1',
      registerType: 'coils',
      address: 12,
      state: true
    })
  })

  it('refuses a schema on a channel that has to return a value', () => {
    const { windows } = createWindows()
    const ipcHandle = createIpcHandle(windows)

    // create_server answers with the port it actually bound, so there is no
    // honest value to return when the payload is rejected.
    // @ts-expect-error a schema is only accepted on a channel returning void
    ipcHandle('create_server', vi.fn(), SetBooleanParametersSchema)
  })
})

describe('write-path schemas', () => {
  it('accepts a coil write and a register write', () => {
    expect(
      WriteParametersSchema.safeParse({
        address: 4,
        single: true,
        type: 'coils',
        value: [true, false]
      }).success
    ).toBe(true)

    expect(
      WriteParametersSchema.safeParse({
        address: 4,
        single: false,
        type: 'holding_registers',
        value: 1234,
        dataType: 'uint16'
      }).success
    ).toBe(true)
  })

  it('rejects an address outside the Modbus range', () => {
    const result = WriteParametersSchema.safeParse({
      address: 70000,
      single: true,
      type: 'coils',
      value: [true]
    })
    expect(result.success).toBe(false)
  })

  it('rejects a register write with no data type', () => {
    const result = WriteParametersSchema.safeParse({
      address: 4,
      single: true,
      type: 'holding_registers',
      value: 1234
    })
    expect(result.success).toBe(false)
  })

  it('rejects an add-register payload whose params are incomplete', () => {
    const result = AddRegisterParamsSchema.safeParse({
      uuid: 'server-1',
      unitId: '1',
      littleEndian: false,
      params: { address: 0, registerType: 'holding_registers' }
    })
    expect(result.success).toBe(false)
  })
})
