// @vitest-environment happy-dom
/// <reference types="@testing-library/jest-dom/vitest" />
//
// The navigator's window follows the log without adding a style rule a
// render: emotion never removes a class, so a position in `sx` grows the
// document's stylesheet for as long as the trend is open. Its line is drawn
// when an answer brings points or the strip changes size, not on each of the
// renders in between that only move the window.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { LogPoint } from '@shared'
import TrendNavigator from '../TrendNavigator'

const MINUTE = 60_000
const RANGE = 10 * MINUTE

/** The style elements emotion has inserted, one a rule outside production. */
const emotionRules = (): number => document.querySelectorAll('style[data-emotion]').length

/** What the canvas was last drawn with: each clear starts a drawing. */
const drawing = { clears: 0, xs: [] as number[] }
let stripWidth = 600
let resized: () => void = () => undefined

/** happy-dom draws on no canvas and lays nothing out, so the test does both. */
const stubCanvas = (): void => {
  const context = {
    clearRect: (): void => {
      drawing.clears++
      drawing.xs = []
    },
    beginPath: (): void => undefined,
    moveTo: (x: number): void => void drawing.xs.push(x),
    lineTo: (x: number): void => void drawing.xs.push(x),
    stroke: (): void => undefined
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  )
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => stripWidth)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(30)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resized = callback
      }
      observe(): void {
        resized()
      }
      disconnect(): void {
        resized = (): void => undefined
      }
    }
  )
}

/** A sample a minute from the log's start up to `end`. */
const samplesUpTo = (end: number): LogPoint[] =>
  Array.from({ length: end / MINUTE + 1 }, (_, i) => ({
    time: i * MINUTE,
    value: i,
    error: undefined
  }))

const navigator = (end: number, points: LogPoint[] = []): JSX.Element => (
  <TrendNavigator
    start={0}
    end={end}
    from={end - RANGE}
    to={end}
    points={points}
    color="#4caf50"
    onPan={() => undefined}
  />
)

beforeEach(() => {
  stubCanvas()
  stripWidth = 600
  drawing.clears = 0
  drawing.xs = []
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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

describe('the navigator line', () => {
  it('is not drawn again by renders that bring no new points', () => {
    const points = samplesUpTo(20 * MINUTE)
    const { rerender } = render(navigator(20 * MINUTE, points))
    const drawn = drawing.clears

    for (let second = 1; second <= 5; second++)
      rerender(navigator(20 * MINUTE + second * 1000, points))

    expect(drawing.clears).toBe(drawn)
  })

  it('is drawn across the strip up to the end the newest points came with', () => {
    const { rerender } = render(navigator(20 * MINUTE, samplesUpTo(20 * MINUTE)))

    rerender(navigator(30 * MINUTE, samplesUpTo(30 * MINUTE)))

    expect(drawing.xs.at(0)).toBe(0)
    expect(drawing.xs.at(-1)).toBe(600)
  })

  it('is drawn again across the strip when the strip changes size', () => {
    render(navigator(20 * MINUTE, samplesUpTo(20 * MINUTE)))
    const drawn = drawing.clears

    stripWidth = 800
    act(() => resized())

    expect(drawing.clears).toBe(drawn + 1)
    expect(drawing.xs.at(-1)).toBe(800)
  })
})
