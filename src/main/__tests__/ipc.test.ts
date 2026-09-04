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
  ConnectionConfigSchema,
  CreateServerParamsSchema,
  PortSchema,
  PrivilegedPortFixModeSchema,
  RemoveRegisterParamsSchema,
  ResetBoolsParamsSchema,
  ResetRegistersParamsSchema,
  ScanRegistersParametersSchema,
  ScanUnitIDParametersSchema,
  SetBooleanParametersSchema,
  StartRtuServerParamsSchema,
  SyncBoolsParametersSchema,
  SyncRegisterValueParamsSchema,
  WriteParametersSchema,
  type BackendMessage,
  type Windows
} from '@shared'
import { createIpcHandle, initIpc } from '../ipc'

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
    expect(sent[0]?.variant).toBe('error')
    expect(String(sent[0]?.error)).toContain('set_bool')
    expect(String(sent[0]?.error)).toContain('unitId')
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

    expect(listener.mock.calls[0]?.[1]).toEqual({
      uuid: 'server-1',
      unitId: '1',
      registerType: 'coils',
      address: 12,
      state: true
    })
  })

  it('refuses a schema on a channel with no room for undefined in its answer', () => {
    const { windows } = createWindows()
    const ipcHandle = createIpcHandle(windows)

    // get_privileged_port_status answers with a status object and says nothing
    // about undefined, so there is nothing to hand back for a rejected payload.
    // @ts-expect-error a schema needs undefined to be an honest answer
    ipcHandle('get_privileged_port_status', vi.fn(), PortSchema)
  })

  it('accepts one where the answer admits undefined', () => {
    const { windows } = createWindows()
    const ipcHandle = createIpcHandle(windows)

    // create_server answers Promise<number | undefined> for exactly this, so
    // the guard is allowed and a refused payload does not invent a port.
    ipcHandle('create_server', vi.fn(), CreateServerParamsSchema)
    expect(handle).toHaveBeenCalledWith('create_server', expect.any(Function))
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

//
// The channels that carry a loaded config outward. A saved config file can be
// hand-edited, so what comes back through these is the least trustworthy input
// the app takes.

describe('scan schemas', () => {
  it('accepts a scan over the whole unit id byte', () => {
    const result = ScanUnitIDParametersSchema.safeParse({
      range: [0, 255],
      address: 65535,
      length: 1,
      registerTypes: ['coils'],
      timeout: 1
    })
    expect(result.success).toBe(true)
  })

  it('rejects a unit id scan with no register type, which scans nothing', () => {
    const result = ScanUnitIDParametersSchema.safeParse({
      range: [1, 10],
      address: 0,
      length: 1,
      registerTypes: [],
      timeout: 500
    })
    expect(result.success).toBe(false)
  })

  it('rejects a unit id above the byte a unit id is', () => {
    const result = ScanUnitIDParametersSchema.safeParse({
      range: [1, 256],
      address: 0,
      length: 1,
      registerTypes: ['holding_registers'],
      timeout: 500
    })
    expect(result.success).toBe(false)
  })

  it('rejects a register scan with a timeout of zero, which never waits', () => {
    const result = ScanRegistersParametersSchema.safeParse({
      addressRange: [0, 100],
      length: 10,
      timeout: 0
    })
    expect(result.success).toBe(false)
  })
})

describe('server register schemas', () => {
  it('rejects a remove with an empty uuid, which names no server', () => {
    const result = RemoveRegisterParamsSchema.safeParse({
      uuid: '',
      unitId: '1',
      registerType: 'holding_registers',
      address: 0,
      dataType: 'uint16'
    })
    expect(result.success).toBe(false)
  })

  it('accepts a sync that clears every register, which is a list of none', () => {
    const result = SyncRegisterValueParamsSchema.safeParse({
      uuid: 'server-1',
      unitId: '1',
      registerValues: [],
      littleEndian: false
    })
    expect(result.success).toBe(true)
  })

  it('rejects a sync whose register carries no address', () => {
    const result = SyncRegisterValueParamsSchema.safeParse({
      uuid: 'server-1',
      unitId: '1',
      registerValues: [{ registerType: 'holding_registers', dataType: 'uint16', value: 1 }],
      littleEndian: false
    })
    expect(result.success).toBe(false)
  })

  // The two reset channels take the same three fields and differ only in which
  // register types they accept. Swapping their schemas would pass a test that
  // only checked the happy path of each.
  it('resets registers on a number type and refuses a boolean one', () => {
    const params = { uuid: 'server-1', unitId: '1' }
    expect(
      ResetRegistersParamsSchema.safeParse({ ...params, registerType: 'holding_registers' }).success
    ).toBe(true)
    expect(ResetRegistersParamsSchema.safeParse({ ...params, registerType: 'coils' }).success).toBe(
      false
    )
  })

  it('resets bools on a boolean type and refuses a number one', () => {
    const params = { uuid: 'server-1', unitId: '1' }
    expect(ResetBoolsParamsSchema.safeParse({ ...params, registerType: 'coils' }).success).toBe(
      true
    )
    expect(
      ResetBoolsParamsSchema.safeParse({ ...params, registerType: 'holding_registers' }).success
    ).toBe(false)
  })

  it('rejects a bool sync whose coils are not booleans', () => {
    const result = SyncBoolsParametersSchema.safeParse({
      uuid: 'server-1',
      unitId: '1',
      coils: [1, 0],
      discrete_inputs: []
    })
    expect(result.success).toBe(false)
  })
})

describe('server lifecycle schemas', () => {
  it('accepts the Modbus port and rejects one past 16 bits', () => {
    expect(CreateServerParamsSchema.safeParse({ uuid: 'server-1', port: 502 }).success).toBe(true)
    expect(CreateServerParamsSchema.safeParse({ uuid: 'server-1', port: 70000 }).success).toBe(
      false
    )
  })

  it('rejects an RTU start with no serial config', () => {
    const result = StartRtuServerParamsSchema.safeParse({ uuid: 'server-1' })
    expect(result.success).toBe(false)
  })

  it('accepts both privileged port fix modes and refuses a third', () => {
    expect(PrivilegedPortFixModeSchema.safeParse('session').success).toBe(true)
    expect(PrivilegedPortFixModeSchema.safeParse('persist').success).toBe(true)
    expect(PrivilegedPortFixModeSchema.safeParse('reboot').success).toBe(false)
  })
})

describe('the config updates, which arrive one field at a time', () => {
  it('accepts a nested field on its own', () => {
    const result = ConnectionConfigSchema.deepPartial().safeParse({ tcp: { host: '10.0.0.4' } })
    expect(result.success).toBe(true)
  })

  it('rejects a unit id that is not a number, even nested in a partial', () => {
    const result = ConnectionConfigSchema.deepPartial().safeParse({ unitId: 'one' })
    expect(result.success).toBe(false)
  })
})

//
// Which schema a channel got.
//
// The schema tests above check a schema, and the createIpcHandle tests check the
// guard. Neither says that `sync_bools` got SyncBoolsParametersSchema rather
// than the one beside it, and the reset and sync channels take payloads similar
// enough that a swap parses.
//
// So each channel is driven twice through initIpc. The valid payload must reach
// the listener, which a swapped schema breaks. The invalid one must come back as
// a message naming the channel, which a missing schema breaks: a channel with no
// guard accepts everything, and passing the valid payload proves nothing about
// it.

describe('each guarded channel got its own schema', () => {
  /** Enough of a collaborator to record the call and nothing more. */
  const stub = (): Record<string, ReturnType<typeof vi.fn>> =>
    new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
      get: (target, key: string) => (target[key] ??= vi.fn())
    })

  const validPayloads: Record<string, unknown> = {
    update_connection_config: { unitId: 3 },
    update_register_config: { address: 40, length: 10 },
    set_register_mapping: {
      coils: {},
      discrete_inputs: {},
      input_registers: {},
      holding_registers: {}
    },
    write: { address: 4, single: true, type: 'coils', value: [true] },
    scan_registers: { addressRange: [0, 100], length: 10, timeout: 500 },
    scan_unit_ids: {
      range: [1, 10],
      address: 0,
      length: 1,
      registerTypes: ['holding_registers'],
      timeout: 500
    },
    add_replace_server_register: {
      uuid: 'server-1',
      unitId: '1',
      littleEndian: false,
      params: {
        address: 0,
        registerType: 'holding_registers',
        dataType: 'uint16',
        comment: '',
        value: 1
      }
    },
    remove_server_register: {
      uuid: 'server-1',
      unitId: '1',
      registerType: 'holding_registers',
      address: 0,
      dataType: 'uint16'
    },
    sync_server_register: {
      uuid: 'server-1',
      unitId: '1',
      registerValues: [],
      littleEndian: false
    },
    reset_registers: { uuid: 'server-1', unitId: '1', registerType: 'holding_registers' },
    set_bool: { uuid: 'server-1', unitId: '1', registerType: 'coils', address: 0, state: true },
    reset_bools: { uuid: 'server-1', unitId: '1', registerType: 'coils' },
    sync_bools: { uuid: 'server-1', unitId: '1', coils: [], discrete_inputs: [] },
    start_rtu_server: {
      uuid: 'server-1',
      serialConfig: {
        com: '/dev/ttyUSB0',
        options: { baudRate: '9600', dataBits: 8, stopBits: 1, parity: 'none' }
      }
    }
  }

  const start = (): { sent: BackendMessage[] } => {
    handle.mockClear()
    const { windows, sent } = createWindows()
    initIpc(
      stub() as unknown as Electron.App,
      stub() as never,
      stub() as never,
      stub() as never,
      windows
    )
    return { sent }
  }

  it.each(Object.keys(validPayloads))('lets a valid %s payload through', async (channel) => {
    const { sent } = start()
    await invoke(channel, validPayloads[channel])
    expect(sent.map((message) => message.error)).toEqual([])
  })

  // A string reaches every one of these as an object was expected, so it is the
  // one payload that is wrong for all of them and right for none.
  it.each(Object.keys(validPayloads))(
    'guards %s against a payload that is not one',
    async (channel) => {
      const { sent } = start()
      await invoke(channel, 'not a payload')
      expect(sent.map((message) => String(message.error).split(':')[0])).toEqual([channel])
    }
  )
})
