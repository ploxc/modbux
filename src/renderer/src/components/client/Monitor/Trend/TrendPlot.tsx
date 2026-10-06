import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { AxisRange, TrendSettings } from '@shared'
import { axisScale, TrendGap, TrendSeries, WHEEL_ZOOM, zoomAround } from './trendData'

/** One line of a trend: its colour, the scale it is drawn on, and how the readout names it. */
export interface TrendLine {
  color: string
  /** Lines of one engineering unit share a scale. */
  scale: string
  label: string
  unit: string
}

/** Where the cursor stands over a plot, in window pixels, and the moment under it. */
export interface TrendCursor {
  x: number
  y: number
  at: number
}

/** Where a plot area sits in its box, which the lanes' bars line up with. */
export interface PlotBox {
  left: number
  width: number
}

/**
 * How wide a plot's axis is, in pixels. Every plot area starts this far in,
 * whether its axis shows or not, and the lanes and the time axis start there too.
 */
export const AXIS_SIZE = 44

/** The room right of every plot area, the time axis's included, which its last label runs into. */
export const PLOT_RIGHT = 24

/** The room above a plot area its engineering unit is written in, in pixels. */
const UNIT_ROOM = 16

interface TrendPlotProps {
  /** The trend's cursor group: every plot of one trend shows one cursor. */
  syncKey: string
  /** The lines, which the plot is made for; a new array makes it again. */
  lines: TrendLine[]
  /** Each line's points, in the order of `lines`. */
  data: TrendSeries[]
  /** The engineering unit its axis is of; none for a plot under the lanes, which has no axis. */
  unit: string | undefined
  /** The range its axis is held at, or none to fit what it draws. */
  range: AxisRange | undefined
  drawAs: TrendSettings['drawAs']
  /** The time range drawn, which runs past the last sample while it is live. */
  from: number
  to: number
  /** Where the log's oldest sample is: the range before it is hatched. */
  oldest: number | undefined
  /** Where the log took no samples, each shaded and named by why. */
  gaps: TrendGap[]
  /** A drag across the plot, or a notch of the wheel, asks for this stretch. */
  onZoom: (from: number, to: number) => void
  /** A double click asks for the range again. */
  onZoomOut: () => void
  /** The cursor over this plot, and none once it leaves; a plot the cursor is synced to says nothing. */
  onCursor: (cursor: TrendCursor | undefined) => void
  /** Where the plot area lands in the box, each time it is laid out. */
  onPlot?: (plot: PlotBox) => void
  /** The uPlot of `unit`, once it is made and null once it is gone. */
  onChart?: (unit: string, chart: uPlot | null) => void
}

/** The paths and points of a line, as the settings draw it. */
const drawnAs = (drawAs: TrendSettings['drawAs']): Partial<uPlot.Series> => {
  if (drawAs === 'points') return { paths: () => null, points: { show: true, size: 4 } }
  // uPlot's types leave the builder optional; without it uPlot draws lines.
  if (drawAs === 'steps')
    return { paths: uPlot.paths.stepped?.({ align: 1 }), points: { show: false } }
  return { points: { show: false } }
}

/** How many pixels a drag must cover to zoom, so a click does not. */
const SHORTEST_DRAG = 4

/** What a plot draws behind its lines, read by its hook on every draw. */
interface Backdrop {
  oldest: number | undefined
  gaps: TrendGap[]
}

/**
 * The axis's engineering unit above it, `No unit` for lines of none. uPlot
 * leaves out an axis whose scale holds no value yet, and so does this.
 */
const drawUnit = (chart: uPlot, unit: string, color: string, font: string): void => {
  const { ctx, bbox } = chart
  if (chart.scales[axisScale(unit)]?.min == null) return
  ctx.save()
  ctx.font = font
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillStyle = color
  ctx.fillText(
    unit === '' ? 'No unit' : unit,
    bbox.left - 4 * devicePixelRatio,
    bbox.top - 2 * devicePixelRatio
  )
  ctx.restore()
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
 * The lines of one engineering unit over time, drawn by uPlot on a canvas as
 * big as the box it fills, on the time of the trend's other plots and with
 * their cursor; with no unit, the room under the lanes, which takes the
 * cursor, the drag and the wheel as a plot does. It draws no time axis of its
 * own. The plot is made again when its lines or its axis change, and
 * otherwise handed new data, which is what uPlot is quick at. Samples of
 * different registers come at different moments, so `uPlot.join` aligns them,
 * leaving a line undrawn where only another register has a sample and a gap
 * where its own points say so.
 */
const TrendPlot = meme(
  ({
    syncKey,
    lines,
    data,
    unit,
    range,
    drawAs,
    from,
    to,
    oldest,
    gaps,
    onZoom,
    onZoomOut,
    onCursor,
    onPlot,
    onChart
  }: TrendPlotProps): JSX.Element => {
    const theme = useTheme()
    const container = useRef<HTMLDivElement>(null)
    const chart = useRef<uPlot | null>(null)
    const backdrop = useRef<Backdrop>({ oldest, gaps })
    // The plot is made once for its lines, so its handlers read the latest.
    const zoom = useRef(onZoom)
    zoom.current = onZoom
    const zoomOut = useRef(onZoomOut)
    zoomOut.current = onZoomOut
    const cursorMoved = useRef(onCursor)
    cursorMoved.current = onCursor
    const plotted = useRef(onPlot)
    plotted.current = onPlot
    const handed = useRef(onChart)
    handed.current = onChart
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
      const colors = {
        hatch: theme.palette.divider,
        gap: alpha(theme.palette.error.main, 0.06),
        label: theme.palette.text.secondary
      }
      const labelFont = `${10 * devicePixelRatio}px ${theme.typography.fontFamily ?? 'sans-serif'}`
      const unitFont = `500 ${10 * devicePixelRatio}px ${theme.typography.fontFamily ?? 'sans-serif'}`
      const scale = unit === undefined ? undefined : axisScale(unit)
      const options: uPlot.Options = {
        width: box.clientWidth,
        height: box.clientHeight,
        ms: 1,
        legend: { show: false },
        // The axis's room stays while uPlot leaves out an axis with no value,
        // so the plot area starts where every other plot's does.
        padding: [
          unit === undefined ? 0 : UNIT_ROOM,
          PLOT_RIGHT,
          0,
          (_self, _side, sidesWithAxes): number => (sidesWithAxes[3] ? 0 : AXIS_SIZE)
        ],
        cursor: {
          y: false,
          points: { show: false },
          drag: { x: true, y: false, setScale: false },
          // The cursor moves through every plot of the trend; a drag stays in its own.
          sync: {
            key: syncKey,
            setSeries: false,
            scales: ['x', null],
            filters: { pub: (type) => type === 'mousemove' }
          },
          // In place of uPlot's own, which fits x to the data and so to the
          // margin a zoomed trend asks either side of its stretch.
          bind: {
            dblclick: () => () => {
              zoomOut.current()
              return null
            }
          }
        },
        hooks: {
          // The bbox is in canvas pixels.
          setSize: [
            (sized: uPlot): void =>
              plotted.current?.({
                left: sized.bbox.left / devicePixelRatio,
                width: sized.bbox.width / devicePixelRatio
              })
          ],
          drawClear: [
            (drawn: uPlot): void => {
              if (unit !== undefined) drawBackdrop(drawn, backdrop.current, colors, labelFont)
            }
          ],
          draw: [
            (drawn: uPlot): void => {
              if (unit !== undefined) drawUnit(drawn, unit, theme.palette.text.primary, unitFont)
            }
          ],
          setCursor: [
            (hovered: uPlot): void => {
              // A plot the cursor is synced to has no event of its own.
              if (hovered.cursor.event == null) return
              const { left, top } = hovered.cursor
              if (left === undefined || top === undefined || left < 0) {
                cursorMoved.current(undefined)
                return
              }
              const over = hovered.over.getBoundingClientRect()
              cursorMoved.current({
                x: over.left + left,
                y: over.top + top,
                at: hovered.posToVal(left, 'x')
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
          // A unit held at a range draws it whatever its lines hold.
          ...(scale === undefined
            ? {}
            : {
                [scale]:
                  range === undefined
                    ? { auto: true }
                    : { auto: false, range: [range.min, range.max] as uPlot.Range.MinMax }
              })
        },
        axes: [
          // The grid on the time axis's ticks, which the strip under the plots writes.
          { ...axis, size: 0, values: (_chart, ticks) => ticks.map(() => '') },
          ...(scale === undefined ? [] : [{ ...axis, scale, size: AXIS_SIZE }])
        ],
        series: [
          {},
          ...lines.map(({ color }) => ({
            stroke: color,
            scale,
            width: 1.5,
            ...drawnAs(drawAs)
          }))
        ]
      }
      const made = new uPlot(options, [[]], box)
      chart.current = made
      if (unit !== undefined) handed.current?.(unit, made)
      // A sideways swipe is not a zoom.
      const handleWheel = (event: WheelEvent): void => {
        if (event.deltaY === 0) return
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
        // A plot gone from under the cursor leaves no readout behind.
        if (made.cursor.event != null && (made.cursor.left ?? -1) >= 0)
          cursorMoved.current(undefined)
        made.destroy()
        chart.current = null
        if (unit !== undefined) handed.current?.(unit, null)
      }
    }, [syncKey, lines, unit, range, drawAs, theme])

    useEffect(() => {
      const current = chart.current
      if (!current) return
      const tables = data.map((series): uPlot.AlignedData => [series.times, series.values])
      backdrop.current = { oldest, gaps }
      current.setData(tables.length === 0 ? [[]] : uPlot.join(tables), false)
      current.setScale('x', { min: from, max: to })
      // New data moves the samples under a cursor that stands still, so its
      // readout is read again.
      const { left, top } = current.cursor
      if (left !== undefined && top !== undefined && left >= 0) current.setCursor({ left, top })
      // The plot made again for a new theme starts empty, so the data goes in again.
    }, [lines, unit, range, drawAs, data, from, to, oldest, gaps, theme])

    return (
      <Box
        ref={container}
        // No minimum of its own: uPlot's canvas inside it holds the size it
        // was last given, and the observer above sees no less.
        sx={{ position: 'absolute', inset: 0 }}
      />
    )
  }
)

export default TrendPlot
