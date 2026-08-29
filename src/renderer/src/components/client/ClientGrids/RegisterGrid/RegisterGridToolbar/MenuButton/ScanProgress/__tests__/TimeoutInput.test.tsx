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

import { ScanTimeoutField, clampScanTimeout } from '../ScanProgress'

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

  it('corrects a value outside the range when the field is left', async () => {
    const user = userEvent.setup()
    const input = renderField()

    await user.clear(input)
    await user.type(input, '50')
    expect(input.value).toBe('50')

    await user.tab()
    expect(input.value).toBe('100')
  })

  it('leaves a usable value alone', async () => {
    const user = userEvent.setup()
    const input = renderField()

    await user.clear(input)
    await user.type(input, '2000')
    await user.tab()

    expect(input.value).toBe('2000')
  })
})

describe('clampScanTimeout', () => {
  it('pulls the values that would hang or crawl a scan into range', () => {
    expect(clampScanTimeout(0)).toBe(100)
    expect(clampScanTimeout(99)).toBe(100)
    expect(clampScanTimeout(100)).toBe(100)
    expect(clampScanTimeout(10000)).toBe(10000)
    expect(clampScanTimeout(10001)).toBe(10000)
  })
})
