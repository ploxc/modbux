// @vitest-environment happy-dom
//
// A port another server held was refused before the boundary was reached, so
// no `backend_message` was emitted and the field snapped back to the old value
// with nothing said.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_SERVER_UUID } from '@shared'
import { recordApiCalls, stubRenderer, type ApiCall } from './stubRenderer'
import { getDefaultServer } from '../server.zustand.helpers'

const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({ enqueueSnackbar }))

const SECOND_UUID = 'the-server-on-503'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  enqueueSnackbar.mockClear()
  stubRenderer()
})

/** The store with two ready servers, 502 selected and 503 beside it. */
const twoServers = async (): Promise<{
  setPort: (port: string) => Promise<void>
  portOf: (uuid: string) => string | undefined
}> => {
  const { useServerZustand } = await import('../server.zustand')
  useServerZustand.setState({
    selectedUuid: MAIN_SERVER_UUID,
    servers: {
      [MAIN_SERVER_UUID]: { ...getDefaultServer(), port: '502' },
      [SECOND_UUID]: { ...getDefaultServer(), port: '503' }
    },
    ready: { [MAIN_SERVER_UUID]: true, [SECOND_UUID]: true }
  })
  return {
    setPort: useServerZustand.getState().setPort,
    portOf: (uuid) => useServerZustand.getState().servers[uuid]?.port
  }
}

describe('a port another server holds', () => {
  it('is refused with a message naming it', async () => {
    const { setPort } = await twoServers()

    await setPort('503')

    expect(enqueueSnackbar).toHaveBeenCalledWith({
      message: 'Port 503 is already used by another server',
      variant: 'error'
    })
  })

  it('never reaches main', async () => {
    const { setPort, portOf } = await twoServers()
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await setPort('503')

    expect(calls.filter((call) => call.method === 'setServerPort')).toEqual([])
    expect(portOf(MAIN_SERVER_UUID)).toBe('502')
  })
})

describe('the port this server already holds', () => {
  // Retyping the same number is no change, and main's probe would answer
  // `EADDRINUSE` for this server's own listener.
  it('is refused with nothing said', async () => {
    const { setPort } = await twoServers()
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await setPort('502')

    expect(enqueueSnackbar).not.toHaveBeenCalled()
    expect(calls.filter((call) => call.method === 'setServerPort')).toEqual([])
  })
})

describe('a port a deleted server held', () => {
  // The port went with the key. A record per uuid answered for a server the
  // list no longer had, until a sweep reached it.
  it('is taken, not refused', async () => {
    const { useServerZustand } = await import('../server.zustand')
    await twoServers()
    await useServerZustand.getState().deleteServer(SECOND_UUID)
    const calls: ApiCall[] = []
    recordApiCalls(calls)

    await useServerZustand.getState().setPort('503')

    expect(enqueueSnackbar).not.toHaveBeenCalled()
    expect(calls.map((call) => call.method)).toContain('setServerPort')
  })
})
