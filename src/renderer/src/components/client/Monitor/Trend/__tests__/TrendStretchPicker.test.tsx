// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The calendar opens its popover on the stretch the trend shows, and a log
// emptied while it is open closes it for good.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store, which the live store imports, registers IPC listeners and
// calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { act, cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useLiveZustand } from '@renderer/context/live.zustand'
import { defaultClientState, emptyLogStatus } from '@shared'
import { DateTime } from 'luxon'
import TrendStretchPicker from '../TrendStretchPicker'
import { useTrendPanelZustand } from '../trendPanel.zustand'

afterEach(cleanup)

const UUID = 'client-1'
const START = Date.UTC(2026, 8, 29, 13, 40)
const END = START + 60 * 60 * 1000

/** The client's log, stopped at END, holding from `oldest`, or empty. */
const logFrom = (oldest: number | undefined): void =>
  act(() =>
    useLiveZustand.getState().setClientState(UUID, {
      ...defaultClientState,
      log: { ...emptyLogStatus(), oldest, runs: [{ start: START, end: END }] }
    })
  )

beforeEach(() => {
  useTrendPanelZustand.setState({ uuid: UUID, view: undefined, range: '10m' })
})

const picker = (
  <ToggleButtonGroup exclusive value={null}>
    <TrendStretchPicker />
  </ToggleButtonGroup>
)

describe('the calendar', () => {
  it('opens on a press, and cannot be pressed with an empty log', async () => {
    logFrom(undefined)
    render(picker)
    expect(screen.getByTestId('trend-range-calendar')).toBeDisabled()

    logFrom(START)
    await userEvent.click(screen.getByTestId('trend-range-calendar'))
    expect(screen.getByTestId('trend-stretch-show-btn')).toBeInTheDocument()
  })

  // The trend shows the range up to where the log stopped.
  it('opens on the stretch the trend shows', async () => {
    logFrom(START)
    render(picker)

    await userEvent.click(screen.getByTestId('trend-range-calendar'))

    const shown = (time: number): string =>
      DateTime.fromMillis(time).toFormat('yyyy-MM-dd HH:mm:ss')
    // The picker's field keeps its value in an input under the testid.
    const valueOf = (testId: string): string | undefined =>
      screen.getByTestId(testId).querySelector('input')?.value
    expect(valueOf('trend-stretch-from')).toBe(shown(END - 10 * 60 * 1000))
    expect(valueOf('trend-stretch-to')).toBe(shown(END))
  })

  it('stays closed once the log it was open on was emptied and fills again', async () => {
    logFrom(START)
    render(picker)
    await userEvent.click(screen.getByTestId('trend-range-calendar'))
    expect(screen.getByTestId('trend-stretch-show-btn')).toBeInTheDocument()

    logFrom(undefined)
    logFrom(END)

    expect(screen.queryByTestId('trend-stretch-show-btn')).toBeNull()
    expect(screen.getByTestId('trend-range-calendar')).toBeEnabled()
  })
})
