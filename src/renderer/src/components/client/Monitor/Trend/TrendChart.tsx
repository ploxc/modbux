import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DateTime } from 'luxon'
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { TrendGap, TrendSeries, WHEEL_ZOOM, zoomAround } from './trendData'

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
  /** Where the log's oldest sample is: the range before it is hatched. */
  oldest: number | undefined
  /** Where the log took no samples, each shaded and named by why. */
  gaps: TrendGap[]
  /** A drag across the plot, or a notch of the wheel, asks for this stretch. */
  onZoom: (from: number, to: number) => void
}

/** How many pixels a drag must cover to zoom, so a click does not. */
const SHORTEST_DRAG = 4

/** What the chart draws behind its lines, read by its hook on every draw. */
interface Backdrop {
  oldest: number | undefined
  gaps: TrendGap[]
}

/** Canvas pixels between the hatch's lines. */
const HATCH_SPACING = 8

/**
 * The hatch over the range before the log's oldest sample, and a shade over
 * each gap with its reason at its top left, clipped to the plot.
 */
const drawBackdrop = (
  chart: uPlot,
  { oldest, gaps }: Backdrop,
  colors: { hatch: string; gap: string; label: string },
  font: string
): void => {
  const { ctx, bbox } = chart
  const xOf = (time: number): number => chart.valToPos(time, 'x', true)
  ctx.save()
  ctx.beginPath()
  ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height)
  ctx.clip()

  const hatchEnd = oldest === undefined ? bbox.left : Math.min(xOf(oldest), bbox.left + bbox.width)
  if (hatchEnd > bbox.left) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(bbox.left, bbox.top, hatchEnd - bbox.left, bbox.height)
    ctx.clip()
    ctx.strokeStyle = colors.hatch
    ctx.lineWidth = devicePixelRatio
    ctx.beginPath()
    const spacing = HATCH_SPACING * devicePixelRatio
    for (let x = bbox.left - bbox.height; x < hatchEnd; x += spacing) {
      ctx.moveTo(x, bbox.top + bbox.height)
      ctx.lineTo(x + bbox.height, bbox.top)
    }
    ctx.stroke()
    ctx.restore()
  }

  ctx.font = font
  ctx.textBaseline = 'top'
  for (const { start, end, reason } of gaps) {
    const left = xOf(start)
    const right = xOf(end)
    if (right <= left) continue
    ctx.fillStyle = colors.gap
    ctx.fillRect(left, bbox.top, right - left, bbox.height)
    if (reason === undefined) continue
    ctx.fillStyle = colors.label
    ctx.fillText(reason, left + 4 * devicePixelRatio, bbox.top + 4 * devicePixelRatio)
  }
  ctx.restore()
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
  ({
    lines,
    data,
    leftScale,
    rightScale,
    from,
    to,
    oldest,
    gaps,
    onZoom
  }: TrendChartProps): JSX.Element => {
    const theme = useTheme()
    const container = useRef<HTMLDivElement>(null)
    const chart = useRef<uPlot | null>(null)
    const backdrop = useRef<Backdrop>({ oldest, gaps })
    // The chart is made once for its lines, so its handlers read the latest.
    const zoom = useRef(onZoom)
    zoom.current = onZoom
    const shown = useRef({ from, to })
    shown.current = { from, to }

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
      const colors = {
        hatch: theme.palette.divider,
        gap: alpha(theme.palette.error.main, 0.06),
        label: theme.palette.text.secondary
      }
      const labelFont = `${10 * devicePixelRatio}px ${theme.typography.fontFamily ?? 'sans-serif'}`
      const options: uPlot.Options = {
        width: box.clientWidth,
        height: box.clientHeight,
        ms: 1,
        legend: { show: false },
        cursor: {
          y: false,
          points: { show: false },
          drag: { x: true, y: false, setScale: false }
        },
        hooks: {
          drawClear: [
            (drawn: uPlot): void => drawBackdrop(drawn, backdrop.current, colors, labelFont)
          ],
          setSelect: [
            (selected: uPlot): void => {
              const { left, width } = selected.select
              if (width < SHORTEST_DRAG) return
              zoom.current(selected.posToVal(left, 'x'), selected.posToVal(left + width, 'x'))
              selected.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
            }
          ]
        },
        scales: {
          x: { time: true },
          ...Object.fromEntries(scales.map((scale) => [scale, { auto: true }]))
        },
        axes: [
          {
            ...axis,
            size: 22,
            // Seconds once the ticks are closer than a minute, and
            // milliseconds once they are closer than a second.
            values: (_chart, ticks, _space, increment) =>
              ticks.map((tick) =>
                DateTime.fromMillis(tick).toFormat(
                  increment < 1000 ? 'HH:mm:ss.SSS' : increment < 60_000 ? 'HH:mm:ss' : 'HH:mm'
                )
              )
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
      const handleWheel = (event: WheelEvent): void => {
        event.preventDefault()
        const at = made.posToVal(event.offsetX, 'x')
        const factor = event.deltaY < 0 ? WHEEL_ZOOM : 1 / WHEEL_ZOOM
        const zoomed = zoomAround(shown.current.from, shown.current.to, at, factor)
        zoom.current(zoomed.from, zoomed.to)
      }
      made.over.addEventListener('wheel', handleWheel, { passive: false })
      const observer = new ResizeObserver(() =>
        made.setSize({ width: box.clientWidth, height: box.clientHeight })
      )
      observer.observe(box)
      return (): void => {
        made.over.removeEventListener('wheel', handleWheel)
        observer.disconnect()
        made.destroy()
        chart.current = null
      }
    }, [lines, leftScale, rightScale, theme])

    useEffect(() => {
      const current = chart.current
      if (!current) return
      const tables = data.map((series): uPlot.AlignedData => [series.times, series.values])
      backdrop.current = { oldest, gaps }
      current.setData(tables.length === 0 ? [[]] : uPlot.join(tables), false)
      current.setScale('x', { min: from, max: to })
      // The chart made again for a new theme starts empty, so the data goes in again.
    }, [lines, data, from, to, oldest, gaps, theme])

    return <Box ref={container} data-testid="trend-chart" sx={{ flexGrow: 1, minHeight: 0 }} />
  }
)

export default TrendChart
