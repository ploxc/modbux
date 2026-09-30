import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DateTime } from 'luxon'
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { TrendSeries } from './trendData'

/** One line of a trend: its colour, and the scale it is drawn on. */
export interface TrendLine {
  color: string
  /** Lines of one engineering unit share a scale. */
  scale: string
}

interface TrendChartProps {
  /** The lines, which the chart is made for; a new array makes it again. */
  lines: TrendLine[]
  /** Each line's points, in the order of `lines`. */
  data: TrendSeries[]
  /** The scale the left axis shows, and the right one's. */
  leftScale: string | undefined
  rightScale: string | undefined
  /** The time range drawn, which runs past the last sample while it is live. */
  from: number
  to: number
}

/**
 * Registers' lines over time, drawn by uPlot on a canvas as big as the box it
 * sits in. The chart is made again when its lines or scales change, and
 * otherwise handed new data, which is what uPlot is quick at. Samples of
 * different registers come at different moments, so `uPlot.join` aligns them,
 * leaving a line undrawn where only another register has a sample and a gap
 * where its own points say so.
 */
const TrendChart = meme(
  ({ lines, data, leftScale, rightScale, from, to }: TrendChartProps): JSX.Element => {
    const theme = useTheme()
    const container = useRef<HTMLDivElement>(null)
    const chart = useRef<uPlot | null>(null)

    useEffect(() => {
      const box = container.current
      if (!box) return
      const axis = {
        stroke: theme.palette.text.secondary,
        grid: { stroke: theme.palette.divider, width: 1 },
        ticks: { show: false },
        font: `10px ${theme.typography.fontFamily ?? 'sans-serif'}`
      }
      const scales = [...new Set(lines.map(({ scale }) => scale))]
      const options: uPlot.Options = {
        width: box.clientWidth,
        height: box.clientHeight,
        ms: 1,
        legend: { show: false },
        cursor: { show: false },
        scales: {
          x: { time: true },
          ...Object.fromEntries(scales.map((scale) => [scale, { auto: true }]))
        },
        axes: [
          {
            ...axis,
            size: 22,
            values: (_chart, ticks) =>
              ticks.map((tick) => DateTime.fromMillis(tick).toFormat('HH:mm'))
          },
          ...(leftScale === undefined ? [] : [{ ...axis, scale: leftScale, size: 44 }]),
          ...(rightScale === undefined
            ? []
            : [{ ...axis, scale: rightScale, side: 1 as const, size: 44, grid: { show: false } }])
        ],
        series: [
          {},
          ...lines.map(({ color, scale }) => ({
            stroke: color,
            scale,
            width: 1.5,
            points: { show: false }
          }))
        ]
      }
      const made = new uPlot(options, [[]], box)
      chart.current = made
      const observer = new ResizeObserver(() =>
        made.setSize({ width: box.clientWidth, height: box.clientHeight })
      )
      observer.observe(box)
      return (): void => {
        observer.disconnect()
        made.destroy()
        chart.current = null
      }
    }, [lines, leftScale, rightScale, theme])

    useEffect(() => {
      const current = chart.current
      if (!current) return
      const tables = data.map((series): uPlot.AlignedData => [series.times, series.values])
      current.setData(tables.length === 0 ? [[]] : uPlot.join(tables), false)
      current.setScale('x', { min: from, max: to })
      // The chart made again for a new theme starts empty, so the data goes in again.
    }, [lines, data, from, to, theme])

    return <Box ref={container} data-testid="trend-chart" sx={{ flexGrow: 1, minHeight: 0 }} />
  }
)

export default TrendChart
