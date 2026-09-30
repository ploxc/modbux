// @vitest-environment happy-dom
//
// Main sends a client's state every round while it logs, with the log's runs
// built anew each time. The trend draws from the runs, so they keep their
// reference while they are the same, and change when a run starts or ends.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, MAIN_CLIENT_UUID } from '@shared'
import type { LogRun } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const load = async (): Promise<typeof import('../live.zustand')> => {
  await import('../client.zustand')
  return import('../live.zustand')
}

/** A round of a client that logs, its log's runs as main builds them. */
const round = (runs: LogRun[], samples = 0): void =>
  fireEvent('client_state', {
    uuid: MAIN_CLIENT_UUID,
    clientState: {
      ...defaultClientState,
      connectState: 'connected',
      polling: true,
      log: { ...defaultClientState.log, enabled: true, running: true, samples, runs }
    }
  })

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe("a logging client's runs", () => {
  it('keep their reference over rounds that leave them the same', async () => {
    const live = await load()
    const runsOf = (): LogRun[] =>
      live.dataOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID).clientState.log.runs
    round([{ start: 1000 }])
    const first = runsOf()

    round([{ start: 1000 }])

    expect(runsOf()).toBe(first)
  })

  it('leave the rest of a round that keeps them to be taken as it came', async () => {
    const live = await load()
    round([{ start: 1000 }], 10)

    round([{ start: 1000 }], 11)

    expect(
      live.dataOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID).clientState.log.samples
    ).toBe(11)
  })

  it('change when a run ends', async () => {
    const live = await load()
    round([{ start: 1000 }])

    round([{ start: 1000, end: 2000, reason: 'poll stopped' }])

    expect(
      live.dataOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID).clientState.log.runs
    ).toEqual([{ start: 1000, end: 2000, reason: 'poll stopped' }])
  })
})
