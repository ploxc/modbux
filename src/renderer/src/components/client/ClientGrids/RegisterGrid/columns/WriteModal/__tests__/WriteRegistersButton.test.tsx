// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// WriteModal reaches both root stores, and each registers ipcRenderer listeners
// on import. The buttons read neither.
vi.mock('@renderer/context/client.zustand', () => ({
  useClientZustand: Object.assign(() => undefined, { getState: () => ({}) })
}))
vi.mock('@renderer/context/data.zustand', () => ({
  useDataZustand: Object.assign(() => undefined, { getState: () => ({ registerData: [] }) })
}))

import { WriteRegistersButton } from '../WriteModal'
import { useValueInputZustand } from '../writeModal.zustand'

const mockWrite = vi.fn()

// @ts-expect-error - Mocking window.api for tests
global.window.api = { write: mockWrite }

describe('the register write buttons', () => {
  beforeEach(() => {
    mockWrite.mockClear()
    useValueInputZustand.setState({ address: 4, dataType: 'int16', value: '7', valid: true })
  })

  it('writes what the field holds', async () => {
    const user = userEvent.setup()
    render(<WriteRegistersButton />)

    await user.click(screen.getByTestId('write-fc6-btn'))

    expect(mockWrite).toHaveBeenCalledWith({
      address: 4,
      dataType: 'int16',
      type: 'holding_registers',
      value: 7,
      single: true
    })
  })

  it('sends nothing while the field is empty', async () => {
    // The click is delivered whatever the button says about itself, so what is
    // asserted is that nothing went out, not that a button looked disabled.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    useValueInputZustand.setState({ value: '', valid: false })
    render(<WriteRegistersButton />)

    await user.click(screen.getByTestId('write-fc6-btn'))
    await user.click(screen.getByTestId('write-fc16-btn'))

    // `Number('')` is 0, so a write that goes out at all writes a zero the user
    // never typed.
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('sends nothing while the field holds a lone minus', async () => {
    // `Number('-')` is NaN, and the mask hands that state over on the way to a
    // negative number, so it is a field that is not empty and not a value.
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    useValueInputZustand.setState({ value: '-', valid: false })
    render(<WriteRegistersButton />)

    await user.click(screen.getByTestId('write-fc6-btn'))

    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('writes again once the field holds a value', async () => {
    const user = userEvent.setup()
    useValueInputZustand.setState({ value: '', valid: false })
    render(<WriteRegistersButton />)

    useValueInputZustand.getState().setValue('12', true)
    await user.click(screen.getByTestId('write-fc16-btn'))

    expect(mockWrite).toHaveBeenCalledWith({
      address: 4,
      dataType: 'int16',
      type: 'holding_registers',
      value: 12,
      single: false
    })
  })
})

describe('resetValue', () => {
  it('leaves the field valid for the next address opened', () => {
    useValueInputZustand.getState().setValue('', false)

    useValueInputZustand.getState().resetValue()

    expect(useValueInputZustand.getState().value).toBe('0')
    expect(useValueInputZustand.getState().valid).toBe(true)
  })
})
