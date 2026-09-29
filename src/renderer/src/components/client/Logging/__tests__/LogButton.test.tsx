// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The log button beside Poll: greyed until a register logs, a press that
// enables logging, asking first over samples, and while the log is on a press
// that opens the log, whose Turn logging off asks first while the client polls.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { ApiCall, recordApiCalls } from '@renderer/context/__tests__/stubRenderer'
import { patchShownData } from '@renderer/context/__tests__/shownData'
import { patchSelectedUnit } from '@renderer/context/__tests__/selectedClient'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { ClientState, defaultClientState, emptyRegisterMapping, LogStatus } from '@shared'
import LogButton from '../LogButton'

let calls: ApiCall[] = []

/** The calls of `method` main was asked, by their payload. */
const payloadsOf = (method: string): unknown[] =>
  calls.filter((call) => call.method === method).map(({ payload }) => payload)

const renderLogButton = ({
  logs = true,
  log = {},
  ...clientState
}: Omit<Partial<ClientState>, 'log'> & {
  logs?: boolean
  log?: Partial<LogStatus>
} = {}): HTMLElement => {
  const registerMapping = emptyRegisterMapping()
  registerMapping.holding_registers = {
    0: { dataType: 'uint16', ...(logs && { log: { mode: 'poll' as const } }) }
  }
  patchSelectedUnit(useClientZustand, { registerMapping })
  patchShownData(useLiveZustand, {
    clientState: {
      ...defaultClientState,
      connectState: 'connected',
      ...clientState,
      log: { ...defaultClientState.log, ...log }
    }
  })
  render(<LogButton />)
  return screen.getByTestId('log-btn')
}

beforeEach(() => {
  calls = []
  recordApiCalls(calls)
})

afterEach(cleanup)

describe('the log button', () => {
  it('is greyed while no register logs', () => {
    expect(renderLogButton({ logs: false })).toBeDisabled()
  })

  // The log can still be opened, and turned off, after the last register
  // that logged stops logging.
  it('opens the log while logging is on and no register logs any more', () => {
    expect(renderLogButton({ logs: false, log: { enabled: true } })).toBeEnabled()
  })

  // The samples stay reachable after the last register stops logging.
  it('offers only the export over samples while no register logs', async () => {
    const button = renderLogButton({ logs: false, log: { samples: 12 } })
    expect(button).toBeEnabled()

    await userEvent.setup().click(button)

    expect(screen.getByTestId('log-start-export-btn')).toBeInTheDocument()
    expect(screen.queryByTestId('log-start-append-btn')).toBeNull()
    expect(screen.queryByTestId('log-start-new-btn')).toBeNull()
  })

  it('enables logging on a press over an empty log', async () => {
    await userEvent.setup().click(renderLogButton())

    expect(payloadsOf('startLog')).toEqual([
      { uuid: useClientZustand.getState().selectedUuid, append: false }
    ])
  })

  it('asks first over a log that holds samples', async () => {
    await userEvent.setup().click(renderLogButton({ log: { samples: 12 } }))

    expect(screen.getByTestId('log-start-append-btn')).toBeInTheDocument()
    expect(payloadsOf('startLog')).toEqual([])
  })

  it('opens the log while logging is on', async () => {
    await userEvent.setup().click(renderLogButton({ log: { enabled: true } }))

    expect(screen.getByTestId('log-status-popover')).toBeInTheDocument()
  })

  it('turns logging off at once while the client does not poll', async () => {
    const user = userEvent.setup()
    await user.click(renderLogButton({ log: { enabled: true } }))
    await user.click(screen.getByTestId('log-turn-off-btn'))

    expect(payloadsOf('stopLog')).toEqual([useClientZustand.getState().selectedUuid])
  })

  it('asks before turning logging off while the client polls, and keeps polling', async () => {
    const user = userEvent.setup()
    await user.click(renderLogButton({ polling: true, log: { enabled: true, running: true } }))
    await user.click(screen.getByTestId('log-turn-off-btn'))
    expect(payloadsOf('stopLog')).toEqual([])

    await user.click(screen.getByTestId('log-off-confirm-btn'))

    expect(payloadsOf('stopLog')).toEqual([useClientZustand.getState().selectedUuid])
    expect(payloadsOf('stopPolling')).toEqual([])
  })
})
