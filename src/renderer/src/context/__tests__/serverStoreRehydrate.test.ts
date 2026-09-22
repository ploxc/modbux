// @vitest-environment happy-dom
//
// Both windows hold this store and both persist it to one key. Main addresses
// the two events that change it to the window showing the server, so while the
// split is up this copy hears nothing, and when that window closes the events
// come back to a copy that has not moved since load.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SERVER_ZUSTAND_VERSION, SERVER_ZUSTAND_STORAGE_KEY } from '@shared'
import { type ApiCall, fireEvent, recordApiCalls, stubRenderer } from './stubRenderer'

const register = (address: number): Record<string, unknown> => ({
  value: 1,
  params: {
    address,
    registerType: 'holding_registers',
    dataType: 'uint16',
    comment: '',
    value: 1
  }
})

const store = (addresses: number[]): string =>
  JSON.stringify({
    state: {
      selectedUuid: 'u',
      servers: {
        u: {
          port: '502',
          name: 'bench',
          unitId: '0',
          littleEndian: false,
          usedAddresses: {},
          registers: {
            '0': {
              coils: {},
              discrete_inputs: {},
              input_registers: {},
              holding_registers: Object.fromEntries(
                addresses.map((address) => [String(address), register(address)])
              )
            }
          }
        }
      }
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

/** The same blob with a second server in it, as the split out window writes it. */
const withSecondServer = (raw: string, uuid: string): string => {
  const blob = JSON.parse(raw)
  const { state } = blob
  state.selectedUuid = uuid
  state.servers[uuid] = {
    port: '503',
    unitId: '0',
    littleEndian: false,
    registers: {},
    usedAddresses: {}
  }
  return JSON.stringify(blob)
}

/** Waits out the rehydrate, which persist answers with a promise. */
const settle = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

const held = async (): Promise<string[]> => {
  const { useServerZustand } = await import('../server.zustand')
  return Object.keys(useServerZustand.getState().servers.u?.registers['0']?.holding_registers ?? {})
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('the server window closing', () => {
  it('re-reads what that window wrote while it was open', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    await import('../server.zustand')
    expect(await held()).toEqual(['0'])

    // What the split out window persisted, which this copy never heard about.
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })

    expect(await held()).toEqual(['0', '77'])
  })

  // `window_update` fires whenever either window handle moves, and the main
  // window gets one at launch with no server window in it. Re-reading there
  // would undo the repair the store has just done to a config it refused.
  it('does not re-read when no window was ever split', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    await import('../server.zustand')

    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))
    fireEvent('window_update', { main: true, server: false })

    expect(await held()).toEqual(['0'])
  })

  // `ready` is not persisted either, so the rehydrate brought a uuid back with
  // no entry, and `setPort`, `setUnitId` and `setLittleEndian` each refuse on
  // that with no message. The window that made the server ran `createServer`
  // for it, so main does know it.
  it('marks a server the split out window made as one main knows', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    localStorage.setItem(
      SERVER_ZUSTAND_STORAGE_KEY,
      withSecondServer(store([0]), 'made-in-the-split-window')
    )

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(Object.keys(useServerZustand.getState().servers)).toContain('made-in-the-split-window')
    expect(useServerZustand.getState().ready['made-in-the-split-window']).toBe(true)

    useServerZustand.getState().setUnitId('7')
    expect(useServerZustand.getState().servers['made-in-the-split-window']?.unitId).toBe('7')
  })

  // A uuid this window's own `init` wrote `false` for is one main refused, and
  // writing `true` over it hands the three setters back for a server main has
  // no listener for.
  it('leaves a uuid this window already knows about alone', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    useServerZustand.setState({ ready: { u: false } })

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(useServerZustand.getState().ready.u).toBe(false)
  })

  // The load path reads the key back through `PersistedServerZustandSchema`
  // and this one ran `migrateServerState` alone, so a key hand-edited between
  // that window opening and closing was installed unvalidated.
  it('reads the re-read key back through the schema', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    const { useServerZustand } = await import('../server.zustand')
    await settle()
    expect(useServerZustand.getState().configReset).toBeUndefined()

    const edited = JSON.parse(store([0]))
    edited.state.servers = 'nope'
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(edited))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(useServerZustand.getState().configReset?.fields).toContain('servers')
    expect(useServerZustand.getState().servers).toEqual(useServerZustand.getInitialState().servers)
  })

  // The drop that salvages a register runs in the step to version 4, so a blob
  // already at this version reaches `PersistedServerSchema` whole. A key and a
  // `params.address` that disagree cost the field there, which is what every
  // other rule on that schema costs.
  it('resets the registers of a key whose register names another address', async () => {
    const edited = JSON.parse(store([0]))
    edited.state.servers.u.registers['0'].holding_registers = { '5': register(9) }
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(edited))

    const { useServerZustand } = await import('../server.zustand')
    await settle()

    expect(useServerZustand.getState().configReset?.fields).toContain('registers')
    expect(useServerZustand.getState().servers.u?.registers).toEqual({})
  })

  // What one field of one server costs. Read whole, `servers` is one field
  // holding every one of them, so the register below would take the port and
  // the name with it and the second server's registers besides.
  it('keeps the port, the name and the server beside it', async () => {
    const edited = JSON.parse(withSecondServer(store([0]), 'the-other-one'))
    edited.state.servers.u.registers['0'].holding_registers = { '5': register(9) }
    edited.state.servers['the-other-one'].registers = {
      '0': { coils: {}, discrete_inputs: {}, input_registers: {}, holding_registers: {} }
    }
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(edited))

    const { useServerZustand } = await import('../server.zustand')
    await settle()

    const { servers } = useServerZustand.getState()
    expect(servers.u?.port).toBe('502')
    expect(servers.u?.name).toBe('bench')
    expect(Object.keys(servers['the-other-one']?.registers ?? {})).toEqual(['0'])
  })

  // `persist` runs `migrate` only where the blob's version differs from the
  // store's, so a re-read of a key already at the current version leaves
  // `persistedVersion` holding whatever the launch put there. A launch off a
  // newer blob puts a higher number there, and `repairPersisted` answers a
  // reset on that alone.
  it('does not report a newer version twice for a key at this one', async () => {
    const fromNewer = JSON.parse(store([0]))
    fromNewer.version = CURRENT_SERVER_ZUSTAND_VERSION + 1
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(fromNewer))
    const { useServerZustand } = await import('../server.zustand')
    await settle()
    expect(useServerZustand.getState().configReset?.savedByNewerVersion).toBe(true)

    useServerZustand.getState().acknowledgeConfigReset()
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(useServerZustand.getState().configReset).toBeUndefined()
  })

  it('says nothing when the re-read key parses', async () => {
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0]))
    const { useServerZustand } = await import('../server.zustand')
    await settle()

    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, store([0, 77]))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(useServerZustand.getState().configReset).toBeUndefined()
  })

  // `rtuServerActive` is not persisted, so re-reading the key leaves it where
  // it was, and the split out window is the one that heard the last change.
  it('asks main for the RTU status, at load and at the close', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    await import('../server.zustand')

    const asked = (): number => calls.filter((c) => c.method === 'getRtuServerStatus').length
    expect(asked()).toBe(1)

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })

    expect(asked()).toBe(2)
  })
})
