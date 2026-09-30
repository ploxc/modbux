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

import { act, cleanup, render, screen } from '@testing-library/react'
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

/** The log that is on and running, opened over 100,000 samples. */
const openRunningLog = async (): Promise<void> => {
  await userEvent
    .setup()
    .click(renderLogButton({ log: { enabled: true, running: true, samples: 100_000 } }))
}

/** A poll that leaves the log at `samples`. */
const pollTo = (samples: number): void =>
  act(() =>
    patchShownData(useLiveZustand, {
      clientState: {
        ...defaultClientState,
        connectState: 'connected',
        log: { ...defaultClientState.log, enabled: true, running: true, samples }
      }
    })
  )

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
  it('opens the log over samples while no register logs, with nothing to turn on', async () => {
    const button = renderLogButton({ logs: false, log: { samples: 12 } })
    expect(button).toBeEnabled()

    await userEvent.setup().click(button)

    expect(screen.getByTestId('log-export-open-btn')).toBeEnabled()
    expect(screen.queryByTestId('log-turn-on-btn')).toBeNull()
    expect(screen.queryByTestId('log-start-append-btn')).toBeNull()
  })

  it('opens the log on a press, whose Turn logging on starts an empty log', async () => {
    const user = userEvent.setup()
    await user.click(renderLogButton())
    expect(payloadsOf('startLog')).toEqual([])

    await user.click(screen.getByTestId('log-turn-on-btn'))

    expect(payloadsOf('startLog')).toEqual([
      { uuid: useClientZustand.getState().selectedUuid, append: false }
    ])
  })

  it('offers Append and Start new over a log that holds samples', async () => {
    const user = userEvent.setup()
    await user.click(renderLogButton({ log: { samples: 12 } }))
    expect(screen.queryByTestId('log-turn-on-btn')).toBeNull()

    await user.click(screen.getByTestId('log-start-append-btn'))

    expect(payloadsOf('startLog')).toEqual([
      { uuid: useClientZustand.getState().selectedUuid, append: true }
    ])
  })

  it('says what starts a log that is on while the client does not poll', async () => {
    await userEvent.setup().click(renderLogButton({ log: { enabled: true } }))

    expect(screen.getByTestId('log-status-heading')).toHaveTextContent(
      'Logging is on; press Log to start'
    )
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

  // Emotion never removes a class, so a width in `sx` would add a style
  // element on every poll while the log is open.
  it('adds no style rule a poll as the log grows', async () => {
    await openRunningLog()
    const styles = document.querySelectorAll('style[data-emotion]').length

    for (const samples of [200_000, 300_000, 400_000]) pollTo(samples)

    expect(document.querySelectorAll('style[data-emotion]').length).toBe(styles)
  })

  it('fills its bar to the share of the capacity the log holds', async () => {
    await openRunningLog()

    pollTo(400_000)

    expect(screen.getByTestId('log-status-fill')).toHaveStyle({ width: 'max(3px, 40%)' })
  })
})
