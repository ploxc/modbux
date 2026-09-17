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
  type BackendMessage
} from '@shared'
import type { Windows } from '../windows'
import { createIpcHandle, initIpc } from '../ipc'

/** The addressee `send` was given, beside the message it carried. */
interface SentMessage {
  to: unknown
  message: BackendMessage
}

/** Stands in for the `WebContents` that `ipcMain.handle` hands every listener. */
const SENDER = { id: 'the window that asked' }

/**
 * `windows`, with `SENDER` standing in for the main window's contents.
 *
 * `isMain` is what the client channels are refused on, so a stub answering
 * false for everything would refuse the fourteen of them in every test here.
 */
const createWindows = (): { windows: Windows; sent: SentMessage[] } => {
  const sent: SentMessage[] = []
  const windows = {
    send: (_event: string, message: BackendMessage, to: unknown = 'all') =>
      sent.push({ to, message }),
    isMain: (contents: unknown) => contents === SENDER
  } as unknown as Windows
  return { windows, sent }
}

/** Invokes the listener that was registered for `channel`. */
const invoke = async (
  channel: string,
  payload?: unknown,
  sender: unknown = SENDER
): Promise<unknown> => {
  const call = handle.mock.calls.find((c) => c[0] === channel)
  if (!call) throw new Error(`nothing registered for ${channel}`)
  return (call[1] as (e: unknown, p?: unknown) => unknown)({ sender }, payload)
}

beforeEach(() => handle.mockClear())

describe('createIpcHandle', () => {
  it('registers an unguarded channel and passes the payload straight through', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('update_connection_config', listener)
    await invoke('update_connection_config', { unitId: 3 })

    expect(listener).toHaveBeenCalledWith({ sender: SENDER }, { unitId: 3 })
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
    expect(sent[0]?.message.variant).toBe('error')
    expect(String(sent[0]?.message.error)).toContain('set_bool')
    expect(String(sent[0]?.message.error)).toContain('unitId')
  })

  // Broadcasting reached whichever windows were listening. In split view that
  // was the main one, so a payload refused on a channel the server window owns
  // reported into the window the user was not looking at.
  it('reports the refusal to the window that asked', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const otherWindow = { id: 'a window that asked nothing' }

    ipcHandle('set_bool', vi.fn(), SetBooleanParametersSchema)
    await invoke('set_bool', 'not a payload', otherWindow)

    expect(sent.map(({ to }) => to)).toEqual([otherWindow])
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

  // `main/index.ts:23` constructs one `ModbusClient` and none of these channels
  // carries an addressee, so before this any window could aim them at it. The
  // split out server window did, from `client.zustand`'s module scope.
  it('refuses a client channel from a window that is not the main one', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()
    const serverWindow = { id: 'the split out server window' }

    ipcHandle('set_read_configuration', listener)
    const returned = await invoke('set_read_configuration', false, serverWindow)

    expect(listener).not.toHaveBeenCalled()
    expect(returned).toBeUndefined()
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toBe(serverWindow)
    expect(String(sent[0]?.message.error)).toContain('set_read_configuration')
  })

  // A payload the schema also refuses is the input the two orders answer
  // differently on: schema first reports the Zod failure and says nothing about
  // the window. The asker is the question worth answering, so it goes first.
  it('refuses a guarded client channel before it reads the payload', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('scan_unit_ids', listener, ScanUnitIDParametersSchema)
    await invoke('scan_unit_ids', 'not a payload', { id: 'the split out server window' })

    expect(listener).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
    expect(String(sent[0]?.message.error)).toContain('not the main one')
    expect(String(sent[0]?.message.error)).not.toContain('Expected')
  })

  it('reads the payload of a guarded client channel from the main window', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('scan_unit_ids', listener, ScanUnitIDParametersSchema)
    await invoke('scan_unit_ids', 'not a payload')

    expect(listener).not.toHaveBeenCalled()
    expect(String(sent[0]?.message.error)).toContain('scan_unit_ids')
    expect(String(sent[0]?.message.error)).not.toContain('not the main one')
  })

  it('takes the same channel from the main window', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('set_read_configuration', listener)
    await invoke('set_read_configuration', true)

    expect(listener).toHaveBeenCalledWith({ sender: SENDER }, true)
    expect(sent).toEqual([])
  })

  // The RTU server's COM field reads the port list from the server window, so a
  // rule over every channel main's client happens to own would break it.
  it('takes serial discovery from either window', async () => {
    const { windows, sent } = createWindows()
    const ipcHandle = createIpcHandle(windows)
    const listener = vi.fn()

    ipcHandle('list_serial_ports', listener)
    await invoke('list_serial_ports', undefined, { id: 'the split out server window' })

    expect(listener).toHaveBeenCalledOnce()
    expect(sent).toEqual([])
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
      registerValues: []
    })
    expect(result.success).toBe(true)
  })

  it('rejects a sync whose register carries no address', () => {
    const result = SyncRegisterValueParamsSchema.safeParse({
      uuid: 'server-1',
      unitId: '1',
      registerValues: [{ registerType: 'holding_registers', dataType: 'uint16', value: 1 }]
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
      registerValues: []
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
    },
    set_server_port: { uuid: 'server-1', port: 5020 },
    create_server: { uuid: 'server-1', port: 5020 },
    apply_privileged_port_fix: 'persist',
    set_server_endianness: { uuid: 'server-1', littleEndian: true },
    delete_server: 'server-1',
    reset_server: 'server-1'
  }

  const start = (): { sent: SentMessage[] } => {
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

  /**
   * Every channel `initIpc` registered a schema for, asked of the app rather
   * than listed by hand.
   *
   * `undefined` is the one payload every schema here refuses, so a channel that
   * answers with a message has a schema and one that stays silent has none. A
   * string would not do it: `ServerUuidSchema` takes one.
   *
   * The list above was written by hand and covered fourteen of the twenty, so a
   * channel added with a schema did not join it.
   */
  const guardedChannels = async (): Promise<string[]> => {
    const { sent } = start()
    const registered = handle.mock.calls.map((call) => String(call[0]))
    const guarded: string[] = []
    for (const channel of registered) {
      const before = sent.length
      await invoke(channel, undefined)
      if (sent.length > before) guarded.push(channel)
    }
    return guarded
  }

  it('covers every channel that guards its payload', async () => {
    const guarded = await guardedChannels()

    expect(guarded.length).toBeGreaterThan(10)
    expect(guarded.sort()).toEqual(Object.keys(validPayloads).sort())
  })

  // The convention `update_connection_config`'s doc comment states: a channel
  // whose payload can be refused says whether it took it, so the store can read
  // the refusal rather than diverge from main in silence.
  it.each(['update_connection_config', 'update_register_config', 'set_register_mapping'])(
    '%s answers true for a payload it took and undefined for one it refused',
    async (channel) => {
      start()

      expect(await invoke(channel, validPayloads[channel])).toBe(true)
      expect(await invoke(channel, undefined)).toBeUndefined()
    }
  )

  it.each(Object.keys(validPayloads))('lets a valid %s payload through', async (channel) => {
    const { sent } = start()
    await invoke(channel, validPayloads[channel])
    expect(sent.map(({ message }) => message.error)).toEqual([])
  })

  // `undefined` is the payload every schema here refuses. A string used to be,
  // until `delete_server` and `reset_server` took one.
  it.each(Object.keys(validPayloads))(
    'guards %s against a payload that is not one',
    async (channel) => {
      const { sent } = start()
      await invoke(channel, undefined)
      expect(sent.map(({ message }) => String(message.error).split(':')[0])).toEqual([channel])
    }
  )
})
