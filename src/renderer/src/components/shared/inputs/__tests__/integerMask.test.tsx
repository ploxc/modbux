// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// `IMask.MaskedNumber` has a scale of 2 and a radix of ',', so a field that
// takes the defaults accepts a decimal separator. The value reaching the setter
// is then a string `Number()` answers `NaN` to, which the store persists as
// `null`.
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TextField from '@mui/material/TextField'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import { ElementType } from 'react'

import LengthInput from '../LengthInput'
import UIntInput from '../UintInput'
import UnitIdInput from '../UnitIdInput'
import { maskInputProps } from '../types'

const typeInto = async (input: HTMLInputElement, text: string): Promise<void> => {
  const user = userEvent.setup()
  await user.clear(input)
  await user.type(input, text)
}

const renderField = (field: JSX.Element): HTMLInputElement => {
  render(field)
  return screen.getByRole('textbox') as HTMLInputElement
}

// react-imask assigns the value it is handed after it has registered the accept
// listener, and the mask mounts empty, so the assignment reads as a change.
// `setUnitId` and `setAddress` both guard on the value they already hold, and a
// mount of the toolbar field or of the scan dialog's is why.
describe('a masked field on mount', () => {
  it('hands the setter the value it was given', () => {
    const set = vi.fn()
    renderField(
      <TextField
        value="7"
        slotProps={{
          input: {
            // The cast the field's own caller makes, in `ConnectionConfig`.
            inputComponent: UnitIdInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
            inputProps: maskInputProps({ set })
          }
        }}
      />
    )

    expect(set.mock.calls).toEqual([['7', true]])
  })
})

describe('an integer field and a decimal separator', () => {
  it('drops the comma from the unit id', async () => {
    const set = vi.fn()
    const input = renderField(<UnitIdInput set={set} />)

    await typeInto(input, '1,5')

    expect(input.value).toBe('15')
    expect(set).toHaveBeenLastCalledWith('15', true)
  })

  it('drops the comma from the length', async () => {
    const set = vi.fn()
    const input = renderField(<LengthInput set={set} />)

    await typeInto(input, '1,5')

    expect(input.value).toBe('15')
  })

  it('drops the comma from a uint field', async () => {
    const set = vi.fn()
    const input = renderField(<UIntInput set={set} />)

    await typeInto(input, '1,5')

    expect(input.value).toBe('15')
  })

  it('drops the dot as well', async () => {
    const set = vi.fn()
    const input = renderField(<UnitIdInput set={set} />)

    await typeInto(input, '1.5')

    expect(input.value).toBe('15')
  })
})

describe('what the integer fields keep doing', () => {
  it('takes a plain number', async () => {
    const set = vi.fn()
    const input = renderField(<UnitIdInput set={set} />)

    await typeInto(input, '25')

    expect(input.value).toBe('25')
    expect(set).toHaveBeenLastCalledWith('25', true)
  })

  it('holds the unit id at its ceiling', async () => {
    const set = vi.fn()
    const input = renderField(<UnitIdInput set={set} />)

    await typeInto(input, '300')

    expect(input.value).toBe('255')
  })

  it('marks an emptied length invalid', async () => {
    const set = vi.fn()
    const input = renderField(<LengthInput set={set} />)

    await typeInto(input, '10')
    await userEvent.setup().clear(input)

    expect(set).toHaveBeenLastCalledWith('', false)
  })
})
