import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { TrendSettings } from '@shared'
import { DateTime } from 'luxon'
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import { sinceText } from './trendData'
import { AXIS_SIZE, PLOT_RIGHT } from './TrendPlot'

/** How tall the strip is: the time axis's labels. */
const HEIGHT = 22

interface TrendTimeAxisProps {
  from: number
  to: number
  time: TrendSettings['time']
  /** The moment the time since the start counts from: the log's oldest sample. */
  origin: number
}

/**
 * The time axis under the plots, as wide as their plot areas. It is a uPlot
 * of no series, so its ticks fall where the plots' grid lines do: clock time,
 * with seconds once the ticks are closer than a minute and milliseconds once
 * they are closer than a second, or the time since the log's oldest sample.
 */
const TrendTimeAxis = meme(({ from, to, time, origin }: TrendTimeAxisProps): JSX.Element => {
  const theme = useTheme()
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<uPlot | null>(null)
  const since = useRef(origin)
  since.current = origin

  useEffect(() => {
    const box = container.current
    if (!box) return
    const made = new uPlot(
      {
        width: box.clientWidth,
        height: HEIGHT,
        ms: 1,
        legend: { show: false },
        cursor: { show: false },
        padding: [0, PLOT_RIGHT, 0, AXIS_SIZE],
        scales: { x: { time: true } },
        axes: [
          {
            stroke: theme.palette.text.secondary,
            grid: { show: false },
            ticks: { show: false },
            font: `10px ${theme.typography.fontFamily ?? 'sans-serif'}`,
            size: HEIGHT,
            // uPlot hands the tick step fifth, after the axis and its space.
            values: (_chart, ticks, _axis, _space, increment): string[] =>
              ticks.map((tick) =>
                time === 'since'
                  ? sinceText(tick - since.current)
                  : DateTime.fromMillis(tick).toFormat(
                      increment < 1000 ? 'HH:mm:ss.SSS' : increment < 60_000 ? 'HH:mm:ss' : 'HH:mm'
                    )
              )
          }
        ],
        series: [{}]
      },
      [[]],
      box
    )
    chart.current = made
    const observer = new ResizeObserver(() =>
      made.setSize({ width: box.clientWidth, height: HEIGHT })
    )
    observer.observe(box)
    return (): void => {
      observer.disconnect()
      made.destroy()
      chart.current = null
    }
  }, [time, theme])

  useEffect(() => {
    chart.current?.setScale('x', { min: from, max: to })
  }, [from, to, time, theme])
  // uPlot writes the labels again only when the scale moves, and the log's
  // oldest sample moves under a paused trend once the log is full.
  useEffect(() => {
    chart.current?.redraw(false, true)
  }, [origin])

  return (
    <Box
      ref={container}
      data-testid="trend-time-axis"
      sx={{ height: HEIGHT, flexShrink: 0, minWidth: 0, overflow: 'hidden' }}
    />
  )
})

export default TrendTimeAxis
