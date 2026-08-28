// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'

// ScanProgress reads the root store, which opens IPC listeners on import.
vi.mock('@renderer/context/root.zustand', () => ({
  useRootZustand: (selector: (state: Record<string, unknown>) => unknown): unknown =>
    selector({ clientState: {}, scanProgress: 0 })
}))

import { ScanTimeoutField, scanTimeoutOutOfRange } from '../ScanProgress'

// Both dialogs keep the timeout as a number, so the harness does too: that
// round trip is where the field used to rewrite what you typed.
const Harness = (): JSX.Element => {
  const [timeout, setTimeout] = useState(500)

  return (
    <ScanTimeoutField
      disabled={false}
      timeout={timeout}
      setTimeout={(value) => setTimeout(Number(value))}
      testId="timeout"
    />
  )
}

const renderField = (): HTMLInputElement => {
  render(<Harness />)
  return screen.getByTestId('timeout').querySelector('input') as HTMLInputElement
}

describe('scan timeout field', () => {
  it('keeps what you type after the field is cleared', async () => {
    const user = userEvent.setup()
    const input = renderField()

    await user.clear(input)
    await user.type(input, '500')

    expect(input.value).toBe('500')
  })

  it('marks a value outside the range instead of correcting it', async () => {
    const user = userEvent.setup()
    const input = renderField()

    await user.clear(input)
    await user.type(input, '50')

    expect(input.value).toBe('50')
    expect(screen.getByTestId('timeout').querySelector('.Mui-error')).not.toBeNull()
  })

  it('leaves a usable value alone', async () => {
    const user = userEvent.setup()
    const input = renderField()

    await user.clear(input)
    await user.type(input, '2000')

    expect(input.value).toBe('2000')
    expect(screen.getByTestId('timeout').querySelector('.Mui-error')).toBeNull()
  })
})

describe('scanTimeoutOutOfRange', () => {
  it('rejects the values that would hang or crawl a scan', () => {
    expect(scanTimeoutOutOfRange(0)).toBe(true)
    expect(scanTimeoutOutOfRange(99)).toBe(true)
    expect(scanTimeoutOutOfRange(100)).toBe(false)
    expect(scanTimeoutOutOfRange(10000)).toBe(false)
    expect(scanTimeoutOutOfRange(10001)).toBe(true)
  })
})
