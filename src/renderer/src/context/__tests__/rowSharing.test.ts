// @vitest-environment happy-dom
//
// A poll hands the renderer every row it read, as new objects. A row whose
// content did not change keeps the object the grid already holds, because the
// grid renders a row again when its object changes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import type { AddressGroup, AddressGroupResult, RegisterData } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const type = 'holding_registers'
const target = { uuid: MAIN_CLIENT_UUID, unit: MAIN_UNIT_UUID, type } as const

const load = async (): Promise<typeof import('../live.zustand')> => {
  await import('../client.zustand')
  return import('../live.zustand')
}

const read = (...rows: RegisterData[]): void => {
  fireEvent('register_data', { ...target, registerData: rows })
}

const groups = (
  addressGroups: AddressGroup[],
  results: AddressGroupResult[] = addressGroups.map(() => ({
    roundTripMillis: 5,
    error: undefined
  }))
): void => {
  fireEvent('address_groups', { ...target, addressGroups, results })
}

/** A fresh row object, as IPC delivers one, with its own hex. */
const row = (address: number, hex = '0000'): RegisterData => ({
  ...getDummyRegisterData(address),
  hex
})

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a poll that reads what the last one read', () => {
  it('keeps the section it had', async () => {
    const { useLiveZustand, sectionOf } = await load()
    read(row(0), row(1))
    const before = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)

    read(row(0), row(1))

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after).toBe(before)
  })
})

describe('a poll where one register changed', () => {
  it('replaces that row, shows its new content, and keeps the others', async () => {
    const { useLiveZustand, sectionOf } = await load()
    read(row(0), row(1), row(2))
    const [first, , third] = sectionOf(
      useLiveZustand.getState(),
      MAIN_CLIENT_UUID,
      MAIN_UNIT_UUID,
      type
    ).registerData

    read(row(0), row(1, '00ff'), row(2))

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.registerData.map(({ hex }) => hex)).toEqual(['0000', '00ff', '0000'])
    expect(after.registerData[0]).toBe(first)
    expect(after.registerData[2]).toBe(third)
  })
})

describe('a poll that reads fewer or other registers', () => {
  it('takes the shorter list', async () => {
    const { useLiveZustand, sectionOf } = await load()
    read(row(0), row(1))

    read(row(0))

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.registerData.map(({ id }) => id)).toEqual([0])
  })

  it('takes a row at the same position but another address', async () => {
    const { useLiveZustand, sectionOf } = await load()
    read(row(0), row(1))

    read(row(0), row(7))

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.registerData.map(({ id }) => id)).toEqual([0, 7])
  })

  it('empties the grid when handed nothing', async () => {
    const { useLiveZustand, sectionOf } = await load()
    read(row(0))

    useLiveZustand.getState().setRegisterData(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, [])

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.registerData).toEqual([])
  })
})

describe('the address groups a poll sends', () => {
  it('keeps the list when they are the same', async () => {
    const { useLiveZustand, sectionOf } = await load()
    groups([[0, 10]])
    const before = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)

    groups([[0, 10]])

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.addressGroups).toBe(before.addressGroups)
  })

  it('takes the list when they changed', async () => {
    const { useLiveZustand, sectionOf } = await load()
    groups([[0, 10]])

    groups([[0, 12]])

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.addressGroups).toEqual([[0, 12]])
  })

  it('takes how the groups went when only that changed', async () => {
    const { useLiveZustand, sectionOf } = await load()
    groups([[0, 10]], [{ roundTripMillis: 5, error: undefined }])

    groups([[0, 10]], [{ roundTripMillis: 9, error: 'Timed out' }])

    const after = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
    expect(after.groupResults).toEqual([{ roundTripMillis: 9, error: 'Timed out' }])
  })
})

describe('the row at an address', () => {
  it('answers from the list the last poll left, not the one before', async () => {
    const { useLiveZustand, rowAt } = await load()
    read(row(0), row(1))
    expect(rowAt(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, 1)?.hex).toBe(
      '0000'
    )

    read(row(0), row(1, '00ff'))

    expect(rowAt(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, 1)?.hex).toBe(
      '00ff'
    )
  })

  it('answers by address, not by position', async () => {
    const { useLiveZustand, rowAt } = await load()
    read(row(10, '000a'), row(20, '0014'))

    expect(rowAt(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, 20)?.hex).toBe(
      '0014'
    )
    expect(rowAt(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, 1)).toBe(
      undefined
    )
  })
})
