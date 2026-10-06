// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// Fixed holds an axis at the range it shows, and at 0 to 100 while it shows none.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// The client store registers IPC listeners and calls main at import time.
vi.hoisted(async () => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const { stubRenderer } = await import('@renderer/context/__tests__/stubRenderer')
  stubRenderer()
})

import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { DEFAULT_TREND_SETTINGS } from '../trendData'
import TrendSettingsPanel from '../TrendSettingsPanel'
import { useTrendPanelZustand } from '../trendPanel.zustand'

const AXES = [{ unit: 'kW', scale: 'unit:kW', colors: ['#fff'] }]

const openFixed = async (): Promise<void> => {
  const user = userEvent.setup()
  render(<TrendSettingsPanel lines={[]} axes={AXES} />)
  await user.click(screen.getByTestId('trend-settings-btn'))
  await user.click(screen.getByTestId('trend-axis-0-fixed'))
}

beforeEach(() => {
  useTrendPanelZustand.setState({ settings: DEFAULT_TREND_SETTINGS })
})

afterEach(cleanup)

describe('Fixed on an axis', () => {
  it('holds the range the axis shows now', async () => {
    useTrendPanelZustand.setState({
      shownRange: (unit) => (unit === 'kW' ? { min: -20, max: 180 } : undefined)
    })
    await openFixed()

    expect(useTrendPanelZustand.getState().settings.axes).toEqual({ kW: { min: -20, max: 180 } })
    expect(screen.getByTestId('trend-axis-0-min')).toHaveValue('-20')
    expect(screen.getByTestId('trend-axis-0-max')).toHaveValue('180')
  })

  it('holds 0 to 100 while the axis shows no value', async () => {
    useTrendPanelZustand.setState({ shownRange: () => undefined })
    await openFixed()

    expect(useTrendPanelZustand.getState().settings.axes).toEqual({ kW: { min: 0, max: 100 } })
    expect(screen.getByTestId('trend-axis-0-min')).toHaveValue('0')
    expect(screen.getByTestId('trend-axis-0-max')).toHaveValue('100')
  })
})
