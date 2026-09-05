// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// `IMask.MaskedNumber` has a scale of 2 and a radix of ',', so a field that
// takes the defaults accepts a decimal separator. The value reaching the setter
// is then a string `Number()` answers `NaN` to, and the store used to persist
// that as `null`.
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import LengthInput from '../LengthInput'
import UIntInput from '../UintInput'
import UnitIdInput from '../UnitIdInput'

const typeInto = async (input: HTMLInputElement, text: string): Promise<void> => {
  const user = userEvent.setup()
  await user.clear(input)
  await user.type(input, text)
}

const renderField = (field: JSX.Element): HTMLInputElement => {
  render(field)
  return screen.getByRole('textbox') as HTMLInputElement
}

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

  it('drops the dot as well, which the mask used to map onto the comma', async () => {
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
