// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The host field holds its own text while it has focus, because the store
// answers after main does and a value written from outside empties the field's
// undo history. A store value that arrives while the user types must not
// overwrite the text; one that arrives with no focus must reach the field.
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TextField from '@mui/material/TextField'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import { ElementType } from 'react'

import HostInput from '../HostInput'
import { maskInputProps } from '../types'
import { MaskSetFn } from '@renderer/context/client.zustand.types'

const hostField = (value: string, set: MaskSetFn): JSX.Element => (
  <TextField
    value={value}
    slotProps={{
      input: {
        inputComponent: HostInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
        inputProps: maskInputProps({ set })
      }
    }}
  />
)

describe('the host field', () => {
  it('hands the setter every key with whether the host is given', async () => {
    const set = vi.fn()
    render(hostField('127.0.0.1', set))
    const input = screen.getByRole('textbox')

    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '10')

    expect(set).toHaveBeenLastCalledWith('10', true)
    expect(set).toHaveBeenCalledWith('', false)
  })

  it('keeps what is typed while a store value from before arrives, and shows the store on blur', async () => {
    const set = vi.fn()
    const { rerender } = render(hostField('127.0.0.1', set))
    const input = screen.getByRole('textbox')

    const user = userEvent.setup()
    await user.clear(input)
    await user.type(input, '10')
    rerender(hostField('1', set))

    expect(input).toHaveValue('10')

    await user.tab()

    expect(input).toHaveValue('1')
  })

  it('shows a store value that arrives while it has no focus', () => {
    const set = vi.fn()
    const { rerender } = render(hostField('127.0.0.1', set))

    rerender(hostField('192.168.1.1', set))

    expect(screen.getByRole('textbox')).toHaveValue('192.168.1.1')
  })
})
