// @vitest-environment happy-dom
//
// A poll reads only the sections on screen. A section that leaves the screen
// while the poll reads it keeps the rows it had, marked stale, until a read
// replaces them or the poll stops.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import type { RegisterData } from '@shared'
import { ApiCall, fireEvent, recordApiCalls, stubRenderer } from './stubRenderer'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const load = async (): Promise<typeof import('../live.zustand')> => {
  await import('../client.zustand')
  return import('../live.zustand')
}

const polling = (on: boolean): void =>
  fireEvent('client_state', {
    uuid: MAIN_CLIENT_UUID,
    clientState: { ...defaultClientState, connectState: 'connected', polling: on }
  })

const staleOf = (live: Awaited<ReturnType<typeof load>>): string[] =>
  live.dataOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID).staleSections

/** The key the store holds the main unit's holding registers under. */
const HOLDING = `${MAIN_UNIT_UUID}:holding_registers`

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('what is on screen', () => {
  it('hands main every section on screen, and none once it leaves', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    const { useLiveZustand } = await load()
    const live = useLiveZustand.getState()

    live.showSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')
    live.showSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'coils')
    live.hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')

    const sent = calls.filter(({ method }) => method === 'setVisibleSections')
    expect(sent.map(({ payload }) => payload)).toEqual([
      {
        uuid: MAIN_CLIENT_UUID,
        sections: [{ unit: MAIN_UNIT_UUID, type: 'holding_registers' }],
        monitor: false
      },
      {
        uuid: MAIN_CLIENT_UUID,
        sections: [
          { unit: MAIN_UNIT_UUID, type: 'holding_registers' },
          { unit: MAIN_UNIT_UUID, type: 'coils' }
        ],
        monitor: false
      },
      {
        uuid: MAIN_CLIENT_UUID,
        sections: [{ unit: MAIN_UNIT_UUID, type: 'coils' }],
        monitor: false
      }
    ])
  })

  it('tells main when Monitor shows the client, and when it leaves', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    const { useLiveZustand } = await load()
    const live = useLiveZustand.getState()

    live.showMonitor(MAIN_CLIENT_UUID)
    live.hideMonitor(MAIN_CLIENT_UUID)

    const sent = calls.filter(({ method }) => method === 'setVisibleSections')
    expect(sent.map(({ payload }) => payload)).toEqual([
      { uuid: MAIN_CLIENT_UUID, sections: [], monitor: true },
      { uuid: MAIN_CLIENT_UUID, sections: [], monitor: false }
    ])
  })
})

describe('what Monitor reads', () => {
  it('is kept apart from the rows Debug shows', async () => {
    const { useLiveZustand } = await load()
    const { sectionOf } = await import('../live.zustand.helpers')
    const target = {
      uuid: MAIN_CLIENT_UUID,
      unit: MAIN_UNIT_UUID,
      type: 'holding_registers'
    } as const
    const row = (id: number): RegisterData => ({ ...getDummyRegisterData(id) })

    fireEvent('register_data', { ...target, registerData: [row(0)], monitor: false })
    fireEvent('register_data', { ...target, registerData: [row(40)], monitor: true })

    const state = useLiveZustand.getState()
    const ids = (monitor: boolean): number[] =>
      sectionOf(
        state,
        MAIN_CLIENT_UUID,
        MAIN_UNIT_UUID,
        'holding_registers',
        monitor
      ).registerData.map(({ id }) => id)
    expect([ids(false), ids(true)]).toEqual([[0], [40]])
  })
})

describe('a section leaving the screen', () => {
  it('is stale while the poll that read it runs', async () => {
    const live = await load()
    polling(true)
    const state = live.useLiveZustand.getState()
    state.showSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')
    state.hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')

    expect(staleOf(live)).toEqual([HOLDING])
  })

  it('is not stale when no poll runs', async () => {
    const live = await load()
    polling(false)
    const state = live.useLiveZustand.getState()
    state.showSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')
    state.hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')

    expect(staleOf(live)).toEqual([])
  })

  it('is not stale when the poll does not read it', async () => {
    const live = await load()
    polling(true)
    const state = live.useLiveZustand.getState()
    state.showSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'coils')
    state.hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'coils')

    expect(staleOf(live)).toEqual([])
  })

  it('is fresh again once a read replaces its rows', async () => {
    const live = await load()
    polling(true)
    const state = live.useLiveZustand.getState()
    state.hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')
    fireEvent('register_data', {
      uuid: MAIN_CLIENT_UUID,
      unit: MAIN_UNIT_UUID,
      type: 'holding_registers',
      registerData: [getDummyRegisterData(0)]
    })

    expect(staleOf(live)).toEqual([])
  })

  it('is fresh again once the poll stops', async () => {
    const live = await load()
    polling(true)
    live.useLiveZustand
      .getState()
      .hideSection(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')
    polling(false)

    expect(staleOf(live)).toEqual([])
  })
})

describe('a client deleted while on screen', () => {
  it('sends main nothing about it, and leaves no data behind', async () => {
    const calls: ApiCall[] = []
    recordApiCalls(calls)
    const live = await load()
    const { useClientZustand } = await import('../client.zustand')
    const client = useClientZustand.getState()
    const other = client.addClient()
    await client.deleteClient(other)
    calls.length = 0

    live.useLiveZustand.getState().hideSection(other, MAIN_UNIT_UUID, 'holding_registers')

    expect(calls.filter(({ method }) => method === 'setVisibleSections')).toEqual([])
    expect(Object.hasOwn(live.useLiveZustand.getState().clients, other)).toBe(false)
  })
})
