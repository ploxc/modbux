// @vitest-environment happy-dom
//
// Main sends a section's groups and their results after every poll. The
// groups keep their reference while they are the same, because the register
// grid builds its columns from them and every row and cell renders on new
// columns; the results carry a round trip that differs on most polls.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAIN_CLIENT_UUID } from '@shared'
import type { AddressGroup } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const target = { uuid: MAIN_CLIENT_UUID, unit: MAIN_UNIT_UUID, type: 'holding_registers' } as const

const load = async (): Promise<typeof import('../live.zustand')> => {
  await import('../client.zustand')
  return import('../live.zustand')
}

/** A poll of `addressGroups`, each answered in `roundTripMillis`. */
const poll = (addressGroups: AddressGroup[], roundTripMillis: number, monitor = false): void =>
  fireEvent('address_groups', {
    ...target,
    addressGroups,
    results: addressGroups.map(() => ({ roundTripMillis, error: undefined })),
    monitor
  })

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe("a poll's groups", () => {
  for (const monitor of [false, true])
    describe(monitor ? 'in Monitor' : 'in Debug', () => {
      const section = (live: Awaited<ReturnType<typeof load>>): ReturnType<typeof live.sectionOf> =>
        live.sectionOf(
          live.useLiveZustand.getState(),
          target.uuid,
          target.unit,
          target.type,
          monitor
        )

      it('keep their reference over a poll with the same groups and another round trip', async () => {
        const live = await load()
        poll([[0, 10]], 4, monitor)
        const first = section(live).addressGroups

        poll([[0, 10]], 5, monitor)

        expect(section(live).addressGroups).toBe(first)
        expect(section(live).groupResults).toEqual([{ roundTripMillis: 5, error: undefined }])
      })

      it('are replaced by a poll with other groups', async () => {
        const live = await load()
        poll([[0, 10]], 4, monitor)

        poll([[0, 20]], 4, monitor)

        expect(section(live).addressGroups).toEqual([[0, 20]])
      })
    })
})
