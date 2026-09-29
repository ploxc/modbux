// @vitest-environment happy-dom
//
// `showMapping` draws a row for each address read configuration reads, which
// is a register with a data type and a bit with a comment.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { emptyRegisterMapping, MAIN_CLIENT_UUID } from '@shared'
import { recordApiCalls, stubRenderer } from './stubRenderer'
import { patchSelectedUnit } from './selectedClient'
import { MAIN_UNIT_UUID } from '../client.zustand.helpers'
import { sectionOf } from '../live.zustand.helpers'

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  stubRenderer()
  recordApiCalls([])
})

describe('showMapping', () => {
  it('draws the commented bits of a coil mapping, and no bit without a comment', async () => {
    const { useClientZustand } = await import('../client.zustand')
    const { useLiveZustand, showMapping } = await import('../live.zustand')
    const registerMapping = emptyRegisterMapping()
    registerMapping.coils = { 2: { comment: 'Pump' }, 3: {}, 7: { comment: 'Fan' } }
    patchSelectedUnit(useClientZustand, { registerMapping })

    showMapping(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'coils')

    const rows = sectionOf(useLiveZustand.getState(), MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'coils')
    expect(rows.registerData.map((row) => row.id)).toEqual([2, 7])
  })

  it('draws the registers with a data type, and no register with only a comment', async () => {
    const { useClientZustand } = await import('../client.zustand')
    const { useLiveZustand, showMapping } = await import('../live.zustand')
    const registerMapping = emptyRegisterMapping()
    registerMapping.holding_registers = { 0: { dataType: 'uint16' }, 1: { comment: 'label' } }
    patchSelectedUnit(useClientZustand, { registerMapping })

    showMapping(MAIN_CLIENT_UUID, MAIN_UNIT_UUID, 'holding_registers')

    const rows = sectionOf(
      useLiveZustand.getState(),
      MAIN_CLIENT_UUID,
      MAIN_UNIT_UUID,
      'holding_registers'
    )
    expect(rows.registerData.map((row) => row.id)).toEqual([0])
  })
})
