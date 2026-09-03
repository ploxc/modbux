import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerRegister } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real server store persists through window.api on import, and the two
// actions below are all this file drives.

const mockRemoveRegister = vi.fn()
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  usedAddresses: {} as Record<string, unknown>,
  removeRegister: mockRemoveRegister
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

import { useAddRegisterZustand } from '../addRegister.zustand'
import { isFormDirty } from '../addRegister.zustand.helpers'

const registerAt100: ServerRegister[number] = {
  value: 0,
  params: {
    address: 100,
    registerType: 'holding_registers',
    dataType: 'uint32',
    comment: 'flow rate',
    value: 7,
    min: undefined,
    max: undefined,
    interval: undefined
  }
}

/** What the edit effect does: fill the fields, then record what it filled. */
const openEditOn = (register: ServerRegister[number]): void => {
  const addRegisterZustand = useAddRegisterZustand.getState()
  addRegisterZustand.setEditRegister(register)
  addRegisterZustand.setRegisterType(register.params.registerType)
  addRegisterZustand.setAddress(String(register.params.address), true)
  addRegisterZustand.setComment(register.params.comment)
  addRegisterZustand.setDataType(register.params.dataType)
  addRegisterZustand.capturePristine()
}

describe('remove', () => {
  beforeEach(() => {
    mockRemoveRegister.mockClear()
    useAddRegisterZustand.getState().resetToDefaults()
  })

  it('removes the register the dialog was opened on, not the address typed after', () => {
    openEditOn(registerAt100)
    useAddRegisterZustand.getState().setAddress('200', true)

    useAddRegisterZustand.getState().remove()

    expect(mockRemoveRegister).toHaveBeenCalledWith({
      uuid: 'main',
      unitId: '0',
      address: 100,
      registerType: 'holding_registers',
      dataType: 'uint32',
      length: undefined
    })
  })

  it('removes nothing outside edit mode', () => {
    useAddRegisterZustand.getState().setRegisterType('holding_registers')
    useAddRegisterZustand.getState().setAddress('100', true)

    useAddRegisterZustand.getState().remove()

    expect(mockRemoveRegister).not.toHaveBeenCalled()
  })
})

describe('what the dialog opened with', () => {
  beforeEach(() => {
    useAddRegisterZustand.getState().resetToDefaults()
  })

  it('reads clean once the fields are filled and recorded', () => {
    openEditOn(registerAt100)

    const state = useAddRegisterZustand.getState()
    expect(isFormDirty(state, state.pristine)).toBe(false)
  })

  it('reads dirty after a field is typed into', () => {
    openEditOn(registerAt100)
    useAddRegisterZustand.getState().setComment('return temperature')

    const state = useAddRegisterZustand.getState()
    expect(isFormDirty(state, state.pristine)).toBe(true)
  })

  // Opening a second register while the fields still hold the first one would
  // otherwise compare the new register against the old one's values.
  it('is dropped when another register is opened', () => {
    openEditOn(registerAt100)
    useAddRegisterZustand.getState().setEditRegister({
      ...registerAt100,
      params: { ...registerAt100.params, address: 300 }
    })

    expect(useAddRegisterZustand.getState().pristine).toBeUndefined()
  })
})
