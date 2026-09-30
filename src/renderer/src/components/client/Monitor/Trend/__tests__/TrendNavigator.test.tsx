// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The navigator's window follows the log without adding a style rule a
// render: emotion never removes a class, so a position in `sx` grows the
// document's stylesheet for as long as the trend is open.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import TrendNavigator from '../TrendNavigator'

const MINUTE = 60_000
const RANGE = 10 * MINUTE

/** The style elements emotion has inserted, one a rule outside production. */
const emotionRules = (): number => document.querySelectorAll('style[data-emotion]').length

const navigator = (end: number): JSX.Element => (
  <TrendNavigator
    start={0}
    end={end}
    from={end - RANGE}
    to={end}
    points={[]}
    color="#4caf50"
    onPan={() => undefined}
  />
)

afterEach(cleanup)

describe('the navigator window', () => {
  it('adds no style rule as a log past its range moves the window', () => {
    const { rerender } = render(navigator(20 * MINUTE))
    const before = emotionRules()

    for (let second = 1; second <= 5; second++) rerender(navigator(20 * MINUTE + second * 1000))

    expect(emotionRules()).toBe(before)
  })

  it('places the window over the stretch the trend shows', () => {
    render(navigator(20 * MINUTE))

    expect(screen.getByTestId('trend-navigator-window')).toHaveStyle({ left: '50%', width: '50%' })
  })
})
