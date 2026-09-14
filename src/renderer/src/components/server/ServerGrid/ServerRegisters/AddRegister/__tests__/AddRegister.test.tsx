// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ServerRegister } from '@shared'

// ─── Store stub ──────────────────────────────────────────────────────
// The real server store persists through window.api on import, which is far
// more machinery than the dialog's buttons need.

const mockRemoveRegister = vi.fn()
const serverState = {
  selectedUuid: 'main',
  getUnitId: (): string => '0',
  usedAddresses: { main: { '0': { holding_registers: [100, 101] } } },
  serverRegisters: {},
  littleEndian: {},
  removeRegister: mockRemoveRegister,
  addRegister: vi.fn()
}

vi.mock('@renderer/context/server.zustand', () => ({
  useServerZustand: Object.assign(
    (selector: (state: typeof serverState) => unknown) => selector(serverState),
    { getState: () => serverState }
  )
}))

import AddRegister from '../AddRegister'
import { useAddRegisterZustand } from '../addRegister.zustand'

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

/** The same address as a generator, which carries a range instead of a value. */
const generatorAt100: ServerRegister[number] = {
  value: 0,
  params: {
    address: 100,
    registerType: 'holding_registers',
    dataType: 'uint32',
    comment: 'flow rate',
    value: undefined,
    min: 0,
    max: 500,
    interval: 5000
  }
}

/** A timestamp the store folds as milliseconds and stores as seconds for unix. */
const JUNE_2024_MS = Date.UTC(2024, 5, 1, 12, 34, 56, 789)

const timestampAt100 = (dataType: 'unix' | 'datetime', value: number): ServerRegister[number] => ({
  value: 0,
  params: {
    address: 100,
    registerType: 'holding_registers',
    dataType,
    comment: 'stamp',
    value,
    min: undefined,
    max: undefined,
    interval: undefined
  }
})

const datetimeAt100 = timestampAt100('datetime', JUNE_2024_MS)
const unixAt100 = timestampAt100('unix', Math.floor(JUNE_2024_MS / 1000))

const submitButton = (): HTMLElement => screen.getByTestId('add-reg-submit-btn')
const removeButton = (): HTMLElement => screen.getByTestId('add-reg-remove-btn')

/** The attribute sits on the MUI field, and what a user types into is inside it. */
const fieldInput = (testId: string): HTMLElement =>
  within(screen.getByTestId(testId)).getByRole('textbox')

/**
 * The picker's sections, which is what a user types a date into.
 *
 * The testid is on the input beside them, which the accessible field structure
 * marks `aria-hidden` and leaves out of the tab order.
 */
const datetimeSections = (): HTMLElement => {
  const sections = screen.getByTestId('add-reg-datetime-input').parentElement
  if (!sections) throw new Error('the datetime picker rendered no sections container')
  return sections
}

/** The dialog opened on a register, which is what puts the two buttons up. */
const renderEditing = (register: ServerRegister[number]): void => {
  useAddRegisterZustand.getState().setEditRegister(register)
  render(<AddRegister />)
}

const allFieldsValid = {
  address: true,
  value: true,
  min: true,
  max: true,
  interval: true,
  registerLength: true,
  stringValue: true
}

describe('what the edit dialog opens with', () => {
  beforeEach(() => {
    useAddRegisterZustand.getState().resetToDefaults()
  })

  // A field marked wrong paints its label as an error, and the register on
  // screen was valid when it was added.
  it('marks nothing wrong when a fixed register opens', () => {
    renderEditing(registerAt100)

    expect(useAddRegisterZustand.getState().valid).toEqual(allFieldsValid)
  })

  it('marks nothing wrong when a generator opens', () => {
    renderEditing(generatorAt100)

    expect(useAddRegisterZustand.getState().valid).toEqual(allFieldsValid)
  })

  // The dialog offers both sets and the register carries one, so switching has
  // to land on something submittable.
  it('has a range ready when a fixed register is switched to Generator', async () => {
    const user = userEvent.setup()
    renderEditing(registerAt100)

    await user.click(screen.getByTestId('add-reg-generator-btn'))

    expect(fieldInput('add-reg-min-input')).toHaveValue('0')
    expect(fieldInput('add-reg-max-input')).toHaveValue('1')
    expect(submitButton()).toBeEnabled()
  })

  it('has a value ready when a generator is switched to Fixed', async () => {
    const user = userEvent.setup()
    renderEditing(generatorAt100)

    await user.click(screen.getByTestId('add-reg-fixed-btn'))

    expect(fieldInput('add-reg-value-input')).toHaveValue('0')
    expect(submitButton()).toBeEnabled()
  })
})

describe('the edit dialog buttons', () => {
  beforeEach(() => {
    mockRemoveRegister.mockClear()
    useAddRegisterZustand.getState().resetToDefaults()
  })

  it('offers Remove and not Submit Change while nothing has been typed', () => {
    renderEditing(registerAt100)

    expect(submitButton()).toBeDisabled()
    expect(removeButton()).toBeEnabled()
  })

  it('offers Submit Change and not Remove once the address is changed', async () => {
    const user = userEvent.setup()
    renderEditing(registerAt100)

    const address = fieldInput('add-reg-address-input')
    await user.clear(address)
    await user.type(address, '200')

    expect(submitButton()).toBeEnabled()
    expect(removeButton()).toBeDisabled()
  })

  // Any field, not only the address the buttons were wrong about.
  it('takes a comment as a change too', async () => {
    const user = userEvent.setup()
    renderEditing(registerAt100)

    await user.type(fieldInput('add-reg-comment-input'), '!')

    expect(submitButton()).toBeEnabled()
    expect(removeButton()).toBeDisabled()
  })

  it('offers Remove again when the address is typed back', async () => {
    const user = userEvent.setup()
    renderEditing(registerAt100)

    const address = fieldInput('add-reg-address-input')
    await user.clear(address)
    await user.type(address, '200')
    await user.clear(address)
    await user.type(address, '100')

    expect(submitButton()).toBeDisabled()
    expect(removeButton()).toBeEnabled()
  })

  // The picker reads `value`, so what the store holds is what it draws.
  it('opens a fixed datetime on the timestamp the register holds', () => {
    renderEditing(datetimeAt100)

    expect(useAddRegisterZustand.getState().value).toBe(String(JUNE_2024_MS))
  })

  it('opens a fixed unix on the timestamp the register holds', () => {
    renderEditing(unixAt100)

    expect(useAddRegisterZustand.getState().value).toBe(String(JUNE_2024_MS - 789))
  })

  it('offers Remove and not Submit Change for a datetime nothing was typed into', () => {
    renderEditing(datetimeAt100)

    expect(submitButton()).toBeDisabled()
    expect(removeButton()).toBeEnabled()
  })

  // The window is the register's, not the picker's, and the two registers do
  // not share one: IEC 870-5 runs to the end of 2127, a uint32 of seconds to
  // 2106/02/07. A date outside greys out Submit Change the way a bad number does.
  it('takes a datetime inside the window the format carries', async () => {
    const user = userEvent.setup()
    renderEditing(datetimeAt100)

    await user.click(datetimeSections())
    await user.keyboard('06152110')

    expect(datetimeSections()).toHaveAttribute('aria-invalid', 'false')
    expect(submitButton()).toBeEnabled()
  })

  it('refuses a datetime past the year the format ends at', async () => {
    const user = userEvent.setup()
    renderEditing(datetimeAt100)

    await user.click(datetimeSections())
    await user.keyboard('06152200')

    expect(datetimeSections()).toHaveAttribute('aria-invalid', 'true')
    expect(submitButton()).toBeDisabled()
  })

  it('takes a unix timestamp inside the range a uint32 of seconds covers', async () => {
    const user = userEvent.setup()
    renderEditing(unixAt100)

    await user.click(datetimeSections())
    await user.keyboard('06152024')

    expect(datetimeSections()).toHaveAttribute('aria-invalid', 'false')
    expect(submitButton()).toBeEnabled()
  })

  it('refuses for unix the same year it takes for datetime', async () => {
    const user = userEvent.setup()
    renderEditing(unixAt100)

    await user.click(datetimeSections())
    await user.keyboard('06152110')

    expect(datetimeSections()).toHaveAttribute('aria-invalid', 'true')
    expect(submitButton()).toBeDisabled()
  })

  it('removes the register it was opened on', async () => {
    const user = userEvent.setup()
    renderEditing(registerAt100)

    await user.click(removeButton())

    expect(mockRemoveRegister).toHaveBeenCalledWith({
      uuid: 'main',
      unitId: '0',
      address: 100,
      registerType: 'holding_registers',
      dataType: 'uint32',
      length: undefined
    })
  })
})
