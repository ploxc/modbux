// @vitest-environment happy-dom
//
// What main pushes about a client lands under that client's uuid, whichever
// client the view shows, and the view reads the one it shows.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ZUSTAND_STORAGE_KEY,
  CURRENT_CLIENT_ZUSTAND_VERSION,
  defaultClientState,
  getDummyRegisterData,
  MAIN_CLIENT_UUID
} from '@shared'
import type { ClientState } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { shownData } from './shownData'
import { getDefaultClient } from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const connected: ClientState = { ...defaultClientState, connectState: 'connected' }

const load = async (): Promise<{
  useClientZustand: typeof import('../client.zustand').useClientZustand
  useDataZustand: typeof import('../data.zustand').useDataZustand
  getShownData: typeof import('../data.zustand').getShownData
}> => {
  const { useClientZustand } = await import('../client.zustand')
  const { useDataZustand, getShownData } = await import('../data.zustand')
  return { useClientZustand, useDataZustand, getShownData }
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('an event about a client the view does not show', () => {
  it('lands under that client and leaves the one shown alone', async () => {
    const { useClientZustand, useDataZustand, getShownData } = await load()
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)

    fireEvent('client_state', { uuid: other, clientState: connected })
    fireEvent('register_data', { uuid: other, registerData: [getDummyRegisterData(5)] })

    expect(getShownData().clientState.connectState).toBe('disconnected')
    expect(getShownData().registerData).toEqual([])
    expect(shownData(useDataZustand, other).clientState.connectState).toBe('connected')
    expect(shownData(useDataZustand, other).registerData.map((row) => row.id)).toEqual([5])
  })

  it('is what the view shows once that client is selected', async () => {
    const { useClientZustand, getShownData } = await load()
    const other = useClientZustand.getState().addClient()
    useClientZustand.getState().setSelectedUuid(MAIN_CLIENT_UUID)
    fireEvent('client_state', { uuid: other, clientState: connected })

    useClientZustand.getState().setSelectedUuid(other)

    expect(getShownData().clientState.connectState).toBe('connected')
  })
})

describe('an event about a client the store does not hold', () => {
  it('lands nowhere', async () => {
    const { useDataZustand } = await load()

    fireEvent('client_state', { uuid: 'nobody', clientState: connected })

    expect(Object.keys(useDataZustand.getState().clients)).not.toContain('nobody')
  })

  // The disconnect a delete asks for pushes the state it leaves after the
  // store has let go of the client.
  it('lands nowhere once the client was taken away', async () => {
    const { useClientZustand, useDataZustand } = await load()
    const other = useClientZustand.getState().addClient()
    fireEvent('client_state', { uuid: other, clientState: connected })

    await useClientZustand.getState().deleteClient(other)
    fireEvent('client_state', { uuid: other, clientState: defaultClientState })

    expect(Object.keys(useDataZustand.getState().clients)).not.toContain(other)
  })
})

describe('rows two scans find at once', () => {
  it('are held apart and written to their own clients', async () => {
    vi.useFakeTimers()
    try {
      const { useClientZustand, useDataZustand } = await load()
      const other = useClientZustand.getState().addClient()
      const scanning: ClientState = { ...connected, scanningRegisters: true }
      fireEvent('client_state', { uuid: MAIN_CLIENT_UUID, clientState: scanning })
      fireEvent('client_state', { uuid: other, clientState: scanning })

      fireEvent('register_data', {
        uuid: MAIN_CLIENT_UUID,
        registerData: [getDummyRegisterData(1)]
      })
      fireEvent('register_data', { uuid: other, registerData: [getDummyRegisterData(2)] })
      fireEvent('client_state', { uuid: other, clientState: connected })

      const ids = (uuid: string): number[] =>
        shownData(useDataZustand, uuid).registerData.map((row) => row.id)
      expect(ids(other)).toEqual([2])
      expect(ids(MAIN_CLIENT_UUID)).toEqual([])

      await vi.advanceTimersByTimeAsync(100)
      expect(ids(MAIN_CLIENT_UUID)).toEqual([1])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('a setter refused while a connection stands', () => {
  it('asks about the client it writes, not another one that is connected', async () => {
    const { useClientZustand } = await load()
    fireEvent('client_state', { uuid: MAIN_CLIENT_UUID, clientState: connected })
    const other = useClientZustand.getState().addClient()

    expect(await useClientZustand.getState().setPort('1502')).toBe(true)
    expect(useClientZustand.getState().clients[other]?.connectionConfig.tcp.options.port).toBe(1502)
  })
})

describe('what main answers about the clients it holds', () => {
  it('lands under each one the store holds, and nowhere for one it does not', async () => {
    localStorage.setItem(
      CLIENT_ZUSTAND_STORAGE_KEY,
      JSON.stringify({
        state: {
          selectedUuid: MAIN_CLIENT_UUID,
          clients: { [MAIN_CLIENT_UUID]: getDefaultClient(), b: getDefaultClient() }
        },
        version: CURRENT_CLIENT_ZUSTAND_VERSION
      })
    )
    // An invoke answers in a task of its own, as IPC does.
    const api = window.api
    window.api = new Proxy(api, {
      get: (target, method: string): unknown =>
        method === 'getClientStates'
          ? (): Promise<Record<string, ClientState>> =>
              new Promise((resolve) =>
                setTimeout(() =>
                  resolve({ [MAIN_CLIENT_UUID]: defaultClientState, b: connected, c: connected })
                )
              )
          : Reflect.get(target, method)
    })

    const { useDataZustand } = await load()
    await vi.waitFor(() =>
      expect(shownData(useDataZustand, 'b').clientState.connectState).toBe('connected')
    )
    expect(Object.keys(useDataZustand.getState().clients)).not.toContain('c')
  })
})
