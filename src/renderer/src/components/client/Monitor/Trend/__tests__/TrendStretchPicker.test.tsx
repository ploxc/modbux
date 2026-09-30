// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The calendar opens its popover on the stretch the trend shows, and a log
// emptied while it is open closes it for good.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import TrendStretchPicker from '../TrendStretchPicker'

afterEach(cleanup)

const START = Date.UTC(2026, 8, 29, 13, 40)
const END = START + 60 * 60 * 1000

const picker = (start: number | undefined): JSX.Element => (
  <ToggleButtonGroup exclusive value={null}>
    <TrendStretchPicker from={END - 10 * 60 * 1000} to={END} start={start} end={END} />
  </ToggleButtonGroup>
)

describe('the calendar', () => {
  it('opens on a press, and cannot be pressed with an empty log', async () => {
    const { rerender } = render(picker(undefined))
    expect(screen.getByTestId('trend-range-calendar')).toBeDisabled()

    rerender(picker(START))
    await userEvent.click(screen.getByTestId('trend-range-calendar'))
    expect(screen.getByTestId('trend-stretch-show-btn')).toBeInTheDocument()
  })

  it('stays closed once the log it was open on was emptied and fills again', async () => {
    const { rerender } = render(picker(START))
    await userEvent.click(screen.getByTestId('trend-range-calendar'))
    expect(screen.getByTestId('trend-stretch-show-btn')).toBeInTheDocument()

    rerender(picker(undefined))
    rerender(picker(END))

    expect(screen.queryByTestId('trend-stretch-show-btn')).toBeNull()
    expect(screen.getByTestId('trend-range-calendar')).toBeEnabled()
  })
})
