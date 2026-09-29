// @vitest-environment happy-dom
//
// Monitor's poll round reads only the groups whose Poll is on. What READ last
// showed of a group turned off stays in Monitor's section until the group is
// read again. A group whose Poll is on and that the round did not read goes.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultClientState, getDummyRegisterData, MAIN_CLIENT_UUID } from '@shared'
import type { AddressGroup, AddressGroupResult, RegisterData, RegisterMapObject } from '@shared'
import { fireEvent, stubRenderer } from './stubRenderer'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'
import type { SectionData } from '../live.zustand.types'

vi.mock('notistack', () => ({ enqueueSnackbar: vi.fn() }))

const type = 'holding_registers'
const target = { uuid: MAIN_CLIENT_UUID, unit: MAIN_UNIT_UUID, type } as const

const load = async (): Promise<{
  live: typeof import('../live.zustand')
  client: typeof import('../client.zustand')
}> => {
  const client = await import('../client.zustand')
  return { client, live: await import('../live.zustand') }
}

const row = (address: number, hex: string): RegisterData => ({
  ...getDummyRegisterData(address),
  hex
})

const result = (roundTripMillis: number): AddressGroupResult => ({
  roundTripMillis,
  error: undefined
})

/** Holding 0 and 200 as two groups, 200's Poll off unless said otherwise. */
const mapTwoGroups = (
  client: Awaited<ReturnType<typeof load>>['client'],
  mapping: RegisterMapObject = {
    0: { dataType: 'uint16' },
    200: { dataType: 'uint16', monitorPollOff: true }
  }
): void => {
  client.useClientZustand.setState((state) => {
    const unit = state.clients[MAIN_CLIENT_UUID]?.units[0]
    if (!unit) throw new Error('no unit')
    unit.registerMapping.holding_registers = mapping
  })
}

/** One Monitor poll read, as main sends it: the groups, then the rows. */
const monitorRead = (
  addressGroups: AddressGroup[],
  results: AddressGroupResult[],
  rows: RegisterData[]
): void => {
  fireEvent('address_groups', { ...target, addressGroups, results, monitor: true })
  fireEvent('register_data', { ...target, registerData: rows, monitor: true })
}

const monitorSection = (live: Awaited<ReturnType<typeof load>>['live']): SectionData =>
  live.sectionOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type, true)

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
})

describe('a Monitor poll round that leaves a group out because its Poll is off', () => {
  it('keeps the rows and the result READ gave that group', async () => {
    const { client, live } = await load()
    mapTwoGroups(client)
    monitorRead(
      [
        [0, 1],
        [200, 1]
      ],
      [result(4), result(7)],
      [row(0, '0001'), row(200, '0032')]
    )

    monitorRead([[0, 1]], [result(5)], [row(0, '0002')])

    const section = monitorSection(live)
    expect(section.registerData.map(({ id, hex }) => [id, hex])).toEqual([
      [0, '0002'],
      [200, '0032']
    ])
    expect(section.addressGroups).toEqual([
      [0, 1],
      [200, 1]
    ])
    expect(section.groupResults.map(({ roundTripMillis }) => roundTripMillis)).toEqual([5, 7])
  })

  it('drops a group whose Poll is on and the round did not read', async () => {
    const { client, live } = await load()
    mapTwoGroups(client, { 0: { dataType: 'uint16' }, 200: { dataType: 'uint16' } })
    monitorRead(
      [
        [0, 1],
        [200, 1]
      ],
      [result(4), result(7)],
      [row(0, '0001'), row(200, '0032')]
    )

    monitorRead([[0, 1]], [result(5)], [row(0, '0002')])

    const section = monitorSection(live)
    expect(section.registerData.map(({ id }) => id)).toEqual([0])
    expect(section.addressGroups).toEqual([[0, 1]])
  })

  it('takes the new rows of a group that is off when the read brought them', async () => {
    const { client, live } = await load()
    mapTwoGroups(client)
    monitorRead(
      [
        [0, 1],
        [200, 1]
      ],
      [result(4), result(7)],
      [row(0, '0001'), row(200, '0032')]
    )

    monitorRead(
      [
        [0, 1],
        [200, 1]
      ],
      [result(5), result(8)],
      [row(0, '0002'), row(200, '0033')]
    )

    const section = monitorSection(live)
    expect(section.registerData.map(({ id, hex }) => [id, hex])).toEqual([
      [0, '0002'],
      [200, '0033']
    ])
    expect(section.groupResults.map(({ roundTripMillis }) => roundTripMillis)).toEqual([5, 8])
  })

  it("fills Debug's section with Monitor's read while logging is on, and not otherwise", async () => {
    const { client, live } = await load()
    mapTwoGroups(client)
    const debugIds = (): number[] =>
      live
        .sectionOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
        .registerData.map(({ id }) => id)

    monitorRead([[0, 1]], [result(5)], [row(0, '0002')])
    expect(debugIds()).toEqual([])

    fireEvent('client_state', {
      uuid: MAIN_CLIENT_UUID,
      clientState: { ...defaultClientState, log: { ...defaultClientState.log, enabled: true } }
    })
    monitorRead([[0, 1]], [result(5)], [row(0, '0003')])
    expect(debugIds()).toEqual([0])
    expect(
      live.sectionOf(live.useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, type)
        .addressGroups
    ).toEqual([[0, 1]])
  })

  it("leaves Debug's section to the read alone", async () => {
    const { client, live } = await load()
    mapTwoGroups(client)
    fireEvent('register_data', { ...target, registerData: [row(0, '0001'), row(200, '0032')] })

    fireEvent('register_data', { ...target, registerData: [row(0, '0002')] })

    const debug = live.sectionOf(
      live.useLiveZustand.getState(),
      MAIN_CLIENT_UUID,
      MAIN_UNIT_UUID,
      type
    )
    expect(debug.registerData.map(({ id }) => id)).toEqual([0])
  })
})
