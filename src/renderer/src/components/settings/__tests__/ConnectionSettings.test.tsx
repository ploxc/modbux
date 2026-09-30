// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The Connection section: a value the schema takes is stored, in
// milliseconds where the field shows seconds, and handed to main with the
// rest; one it refuses puts the field back.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The stores register IPC listeners and call main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ApiCall, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { useConnectionZustand } from '@renderer/context/connection.zustand'
import { defaultConnectionSettings } from '@shared'
import ConnectionSettingsSection from '../ConnectionSettings'

let calls: ApiCall[] = []

beforeEach(() => {
  calls = []
  recordApiCalls(calls)
  useConnectionZustand.setState({ ...defaultConnectionSettings })
})

afterEach(cleanup)

const type = async (testId: string, text: string): Promise<void> => {
  const user = userEvent.setup()
  const field = screen.getByTestId(testId)
  await user.clear(field)
  await user.type(field, `${text}{Enter}`)
}

describe('the Connection section', () => {
  it('stores a wait typed in seconds as milliseconds, and hands main the settings', async () => {
    render(<ConnectionSettingsSection />)

    await type('connection-reconnectFirstWait-input', '5')

    expect(useConnectionZustand.getState().reconnectFirstWait).toBe(5000)
    expect(
      calls.filter(({ method }) => method === 'setConnectionSettings').at(-1)?.payload
    ).toEqual({
      ...defaultConnectionSettings,
      reconnectFirstWait: 5000
    })
  })

  it('takes 0 attempts, which keeps reconnecting, and says so', async () => {
    render(<ConnectionSettingsSection />)

    await type('connection-reconnectAttempts-input', '0')

    expect(useConnectionZustand.getState().reconnectAttempts).toBe(0)
    expect(screen.getByTestId('settings-connection-section')).toHaveTextContent(
      'Keeps reconnecting'
    )
  })

  it('puts back a value the schema refuses, and hands main nothing', async () => {
    render(<ConnectionSettingsSection />)

    await type('connection-offlineAfterTimeouts-input', '0')

    expect(useConnectionZustand.getState().offlineAfterTimeouts).toBe(
      defaultConnectionSettings.offlineAfterTimeouts
    )
    expect(screen.getByTestId('connection-offlineAfterTimeouts-input')).toHaveValue(
      String(defaultConnectionSettings.offlineAfterTimeouts)
    )
    expect(calls.filter(({ method }) => method === 'setConnectionSettings')).toEqual([])
  })

  it('turns keeping on while logging off', async () => {
    render(<ConnectionSettingsSection />)

    await userEvent
      .setup()
      .click(screen.getByRole('switch', { name: 'Keep reconnecting while logging' }))

    expect(useConnectionZustand.getState().reconnectWhileLogging).toBe(false)
  })
})
