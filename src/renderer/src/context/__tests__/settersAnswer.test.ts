// @vitest-environment happy-dom
//
// A caller that replays a setter has to know whether the store took the value.
// Each setter answers `false` on every refusal and `true` once main and the
// store hold the value, including when they held it already. An answer a later
// call superseded is `false` too, and `lateAnswer.test.ts` holds that case.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, MAIN_SERVER_UUID, MAIN_CLIENT_UUID } from '@shared'
import { stubRenderer } from './stubRenderer'
import { getDefaultServer } from '../server.zustand.helpers'
import { patchSelectedClient } from './selectedClient'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

/** Answers one channel differently from the stub, and leaves the rest to it. */
const answerWith = (method: string, answer: (payload: unknown) => Promise<unknown>): void => {
  const underneath = window.api as unknown as Record<string, unknown>
  window.api = new Proxy(
    {},
    { get: (_target, name: string): unknown => (name === method ? answer : underneath[name]) }
  ) as never
}

const loadClient = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  connect: () => void
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useLiveZustand } = await import('../live.zustand')
  const connect = (): void =>
    useLiveZustand
      .getState()
      .setClientState(MAIN_CLIENT_UUID, { ...defaultClientState, connectState: 'connected' })
  return { useClientZustand, connect }
}

describe('a client setter', () => {
  it('answers true once main holds the value', async () => {
    const { useClientZustand } = await loadClient()
    const client = useClientZustand.getState()

    expect(await client.setPollRate(5000)).toBe(true)
    expect(await client.setBaudRate('19200')).toBe(true)
    expect(await client.setHost('10.0.0.5', true)).toBe(true)
    expect(await client.setUnitId('7')).toBe(true)
  })

  it('answers true for a value main holds already', async () => {
    const { useClientZustand } = await loadClient()
    await useClientZustand.getState().setUnitId('7')
    await useClientZustand.getState().setAddress('40')

    expect(await useClientZustand.getState().setUnitId('7')).toBe(true)
    expect(await useClientZustand.getState().setAddress('40')).toBe(true)
  })

  it('answers false for a payload main refuses', async () => {
    const { useClientZustand } = await loadClient()
    const client = useClientZustand.getState()

    expect(await client.setUnitId('1,5')).toBe(false)
    expect(await client.setAddress('4,0')).toBe(false)
    expect(await client.setPollRate(Number.NaN)).toBe(false)
  })

  it('answers false for a value it keeps but never sends', async () => {
    const { useClientZustand } = await loadClient()
    const client = useClientZustand.getState()

    expect(await client.setHost('', false)).toBe(false)
    expect(await client.setCom('', false)).toBe(false)
    expect(await client.setLength('0', false)).toBe(false)
  })

  it('answers false for a connection field while a connection stands', async () => {
    const { useClientZustand, connect } = await loadClient()
    connect()
    const client = useClientZustand.getState()

    expect(await client.setHost('10.0.0.5', true)).toBe(false)
    expect(await client.setBaudRate('19200')).toBe(false)
    expect(await client.setProtocol('ModbusRtu')).toBe(false)
  })

  it('answers false before the store is ready', async () => {
    const { useClientZustand } = await loadClient()
    patchSelectedClient(useClientZustand, {}, { ready: false })
    const client = useClientZustand.getState()

    expect(await client.setPollRate(5000)).toBe(false)
    expect(await client.setType('coils')).toBe(false)
  })
})

describe('replacing the register mapping', () => {
  it('answers true when main takes the mapping', async () => {
    const { useClientZustand } = await loadClient()

    expect(await useClientZustand.getState().clearRegisterMapping()).toBe(true)
  })

  it('answers false when main refuses it', async () => {
    const { useClientZustand } = await loadClient()

    expect(await useClientZustand.getState().replaceRegisterMapping({ coils: 'x' } as never)).toBe(
      false
    )
  })
})

const SECOND_UUID = 'the-server-on-503'

const loadServer = async (): Promise<typeof import('../server.zustand').useServerZustand> => {
  const { useServerZustand } = await import('../server.zustand')
  useServerZustand.setState({
    selectedUuid: MAIN_SERVER_UUID,
    servers: {
      [MAIN_SERVER_UUID]: { ...getDefaultServer(), port: '502' },
      [SECOND_UUID]: { ...getDefaultServer(), port: '503' }
    },
    ready: { [MAIN_SERVER_UUID]: true, [SECOND_UUID]: true }
  })
  return useServerZustand
}

describe('the server port', () => {
  it('answers true once main binds the port asked for', async () => {
    const useServerZustand = await loadServer()
    answerWith('setServerPort', (payload) => Promise.resolve((payload as { port: number }).port))

    expect(await useServerZustand.getState().setPort('1502')).toBe(true)
  })

  it('answers true for the port the server holds already', async () => {
    const useServerZustand = await loadServer()

    expect(await useServerZustand.getState().setPort('502')).toBe(true)
  })

  it('answers false for a port another server holds', async () => {
    const useServerZustand = await loadServer()

    expect(await useServerZustand.getState().setPort('503')).toBe(false)
  })

  it('answers false when main binds nothing', async () => {
    const useServerZustand = await loadServer()
    answerWith('setServerPort', () => Promise.resolve(undefined))

    expect(await useServerZustand.getState().setPort('1502')).toBe(false)
  })

  it('answers false for a server that is not ready', async () => {
    const useServerZustand = await loadServer()
    useServerZustand.setState({ ready: { [MAIN_SERVER_UUID]: false } })

    expect(await useServerZustand.getState().setPort('1502')).toBe(false)
  })

  // `EACCES`, `EADDRINUSE` and port 0 all answer the port the server kept.
  it('answers false when main keeps the port it had, and shows that one', async () => {
    const useServerZustand = await loadServer()
    answerWith('setServerPort', () => Promise.resolve(502))

    expect(await useServerZustand.getState().setPort('1502')).toBe(false)
    expect(useServerZustand.getState().servers[MAIN_SERVER_UUID]?.port).toBe('502')
  })
})

describe('the server byte order', () => {
  it('answers true for a ready server', async () => {
    const useServerZustand = await loadServer()

    expect(await useServerZustand.getState().setLittleEndian(true)).toBe(true)
  })

  it('answers false for a server that is not ready', async () => {
    const useServerZustand = await loadServer()
    useServerZustand.setState({ ready: { [MAIN_SERVER_UUID]: false } })

    expect(await useServerZustand.getState().setLittleEndian(true)).toBe(false)
  })
})

describe('creating a server', () => {
  it('answers true when main binds a port', async () => {
    const useServerZustand = await loadServer()
    answerWith('createServer', () => Promise.resolve(1504))

    expect(await useServerZustand.getState().createServer({ uuid: 'new', port: 1504 })).toBe(true)
  })

  it('answers false when main binds nothing', async () => {
    const useServerZustand = await loadServer()
    answerWith('createServer', () => Promise.resolve(undefined))

    expect(await useServerZustand.getState().createServer({ uuid: 'new', port: 1504 })).toBe(false)
  })
})

describe('a bool', () => {
  it('answers whether it was added', async () => {
    const useServerZustand = await loadServer()

    expect(useServerZustand.getState().addBool('coils', 3)).toBe(true)
    expect(useServerZustand.getState().addBool('coils', 3)).toBe(false)
  })

  it('answers whether it was removed', async () => {
    const useServerZustand = await loadServer()
    useServerZustand.getState().addBool('coils', 3)

    expect(useServerZustand.getState().removeBool('coils', 3)).toBe(true)
    expect(useServerZustand.getState().removeBool('coils', 3)).toBe(false)
  })
})
