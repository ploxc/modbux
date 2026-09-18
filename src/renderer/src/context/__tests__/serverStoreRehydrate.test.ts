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
      uuids: ['u'],
      port: { u: '502' },
      name: { u: 'bench' },
      unitId: { u: '0' },
      littleEndian: { u: false },
      usedAddresses: {},
      serverRegisters: {
        u: {
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
    },
    version: CURRENT_SERVER_ZUSTAND_VERSION
  })

/** The same blob with a second server in it, as the split out window writes it. */
const withSecondServer = (raw: string, uuid: string): string => {
  const blob = JSON.parse(raw)
  const { state } = blob
  state.uuids.push(uuid)
  state.selectedUuid = uuid
  state.port[uuid] = '503'
  state.unitId[uuid] = '0'
  state.littleEndian[uuid] = false
  state.serverRegisters[uuid] = {}
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
  return Object.keys(useServerZustand.getState().serverRegisters.u?.['0']?.holding_registers ?? {})
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

    expect(useServerZustand.getState().uuids).toContain('made-in-the-split-window')
    expect(useServerZustand.getState().ready['made-in-the-split-window']).toBe(true)

    useServerZustand.getState().setUnitId('7')
    expect(useServerZustand.getState().unitId['made-in-the-split-window']).toBe('7')
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
    edited.state.port = 'nope'
    localStorage.setItem(SERVER_ZUSTAND_STORAGE_KEY, JSON.stringify(edited))

    fireEvent('window_update', { main: true, server: true })
    fireEvent('window_update', { main: true, server: false })
    await settle()

    expect(useServerZustand.getState().configReset?.fields).toContain('port')
    expect(useServerZustand.getState().port).toEqual(useServerZustand.getInitialState().port)
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
