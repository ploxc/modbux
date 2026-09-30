import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DateTime } from 'luxon'
import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { figure, TrendGap, TrendSeries, valuesAt, WHEEL_ZOOM, zoomAround } from './trendData'

/** One line of a trend: its colour, the scale it is drawn on, and how the readout names it. */
export interface TrendLine {
  color: string
  /** Lines of one engineering unit share a scale. */
  scale: string
  label: string
  unit: string
}

/** Where the cursor is over the plot, in pixels of the chart's box, and the sample under it. */
interface Readout {
  left: number
  top: number
  index: number
}

/** How far right of the cursor the readout sits, and how wide it is. */
const READOUT_GAP = 12
const READOUT_WIDTH = 220

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
    const joined = useRef<uPlot.AlignedData>([[]])
    const [readout, setReadout] = useState<Readout>()

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
          setCursor: [
            (hovered: uPlot): void => {
              const { left, top, idx } = hovered.cursor
              if (left === undefined || top === undefined || left < 0 || idx == null) {
                setReadout(undefined)
                return
              }
              setReadout({
                left: hovered.over.offsetLeft + left,
                top: hovered.over.offsetTop + top,
                index: idx
              })
            }
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
      joined.current = tables.length === 0 ? [[]] : uPlot.join(tables)
      current.setData(joined.current, false)
      current.setScale('x', { min: from, max: to })
      // The chart made again for a new theme starts empty, so the data goes in again.
    }, [lines, data, from, to, oldest, gaps, theme])

    const time = readout === undefined ? undefined : joined.current[0][readout.index]
    const values = readout === undefined ? [] : valuesAt(joined.current, readout.index)
    const width = container.current?.clientWidth ?? 0
    return (
      <Box
        ref={container}
        data-testid="trend-chart"
        sx={{ position: 'relative', flexGrow: 1, minHeight: 0 }}
      >
        {readout !== undefined && time !== undefined && (
          <Box
            data-testid="trend-readout"
            sx={{
              position: 'absolute',
              top: Math.max(0, readout.top - 20),
              // Beside the cursor, and on its left side near the right edge.
              left:
                readout.left + READOUT_GAP + READOUT_WIDTH > width
                  ? readout.left - READOUT_GAP - READOUT_WIDTH
                  : readout.left + READOUT_GAP,
              width: READOUT_WIDTH,
              boxSizing: 'border-box',
              px: 1.25,
              py: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 0.5,
              bgcolor: 'background.paper',
              border: 1,
              borderColor: 'divider',
              borderRadius: '6px',
              boxShadow: 4,
              fontSize: 11.5,
              pointerEvents: 'none',
              zIndex: 1
            }}
          >
            <Box component="span" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
              {DateTime.fromMillis(time).toFormat('HH:mm:ss.SSS')}
            </Box>
            {lines.map((line, index) => (
              <Box key={line.color} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 8, height: 3, borderRadius: '2px', bgcolor: line.color }} />
                <Box
                  component="span"
                  sx={{
                    flexGrow: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {line.label}
                </Box>
                <Box component="span" sx={{ fontFamily: 'monospace' }}>
                  {figure(values[index])} {line.unit}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    )
  }
)

export default TrendChart
