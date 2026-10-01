import Box from '@mui/material/Box'
import { alpha, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { DateTime } from 'luxon'
import { useEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { TrendSettings } from '@shared'
import {
  figure,
  indexAt,
  READOUT_PADDING,
  READOUT_ROW,
  READOUT_WIDTH,
  readoutPlace,
  sinceText,
  TrendAxis,
  TrendGap,
  TrendSeries,
  valuesAt,
  WHEEL_ZOOM,
  zoomAround
} from './trendData'

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
  /** The moment under the cursor, which every row reads at or before. */
  at: number
}

interface TrendChartProps {
  /** The lines, which the chart is made for; a new array makes it again. */
  lines: TrendLine[]
  /** Each line's points, in the order of `lines`. */
  data: TrendSeries[]
  /** An axis per engineering unit, all on the left, the first the furthest out. */
  axes: TrendAxis[]
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
  /** Where the plot lands in the chart's box, each time it is laid out. */
  onPlot: (plot: { left: number; width: number }) => void
  /** The readout's rows for what the chart does not draw as a line, at a moment. */
  readoutRows: (time: number) => ReadoutRow[]
  /** Each engineering unit's range, the time axis, and how the lines are drawn. */
  settings: TrendSettings
  /** The moment the time since the start counts from: the log's oldest sample. */
  origin: number
}

/** The paths and points of a line, as the settings draw it. */
const drawnAs = (drawAs: TrendSettings['drawAs']): Partial<uPlot.Series> => {
  if (drawAs === 'points') return { paths: () => null, points: { show: true, size: 4 } }
  // uPlot's types leave the builder optional; without it uPlot draws lines.
  if (drawAs === 'steps')
    return { paths: uPlot.paths.stepped?.({ align: 1 }), points: { show: false } }
  return { points: { show: false } }
}

/** A row of the readout for a register the lanes draw. */
export interface ReadoutRow {
  key: string
  label: string
  color: string
  text: string
}

/** How many pixels a drag must cover to zoom, so a click does not. */
const SHORTEST_DRAG = 4

/** What the chart draws behind its lines, read by its hook on every draw. */
interface Backdrop {
  oldest: number | undefined
  gaps: TrendGap[]
}

/** How wide each engineering unit's axis is, in pixels. */
const AXIS_SIZE = 44

/** The room above the plot the axes' units are written in, in pixels. */
const UNIT_ROOM = 16

/**
 * Each axis's engineering unit above it, and a line between two axes. uPlot
 * lays the left axes out from the plot outward in the order they are given,
 * each `AXIS_SIZE` wide, so `outward` lists them nearest the plot first. It
 * leaves out an axis whose scale holds no value yet, and so does this.
 */
const drawUnits = (
  chart: uPlot,
  outward: readonly TrendAxis[],
  colors: { unit: string; line: string },
  font: string
): void => {
  const { ctx, bbox } = chart
  const size = AXIS_SIZE * devicePixelRatio
  ctx.save()
  ctx.font = font
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.lineWidth = devicePixelRatio
  const shown = outward.filter(({ scale }) => chart.scales[scale]?.min != null)
  for (const [index, { unit }] of shown.entries()) {
    const right = bbox.left - index * size
    ctx.fillStyle = colors.unit
    ctx.fillText(unit, right - 4 * devicePixelRatio, bbox.top - 2 * devicePixelRatio)
    if (index === 0) continue
    ctx.strokeStyle = colors.line
    ctx.beginPath()
    ctx.moveTo(right, bbox.top)
    ctx.lineTo(right, bbox.top + bbox.height)
    ctx.stroke()
  }
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
    axes,
    from,
    to,
    oldest,
    gaps,
    onZoom,
    onZoomOut,
    onPlot,
    readoutRows,
    settings,
    origin
  }: TrendChartProps): JSX.Element => {
    const theme = useTheme()
    const container = useRef<HTMLDivElement>(null)
    const chart = useRef<uPlot | null>(null)
    const backdrop = useRef<Backdrop>({ oldest, gaps })
    // The chart is made once for its lines, so its handlers read the latest.
    const zoom = useRef(onZoom)
    zoom.current = onZoom
    const zoomOut = useRef(onZoomOut)
    zoomOut.current = onZoomOut
    const plotted = useRef(onPlot)
    plotted.current = onPlot
    const shown = useRef({ from, to, origin })
    shown.current = { from, to, origin }
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
      const outward = [...axes].reverse()
      const colors = {
        hatch: theme.palette.divider,
        gap: alpha(theme.palette.error.main, 0.06),
        label: theme.palette.text.secondary
      }
      const labelFont = `${10 * devicePixelRatio}px ${theme.typography.fontFamily ?? 'sans-serif'}`
      const unitFont = `500 ${10 * devicePixelRatio}px ${theme.typography.fontFamily ?? 'sans-serif'}`
      const unitColors = { unit: theme.palette.text.primary, line: theme.palette.divider }
      const options: uPlot.Options = {
        width: box.clientWidth,
        height: box.clientHeight,
        ms: 1,
        legend: { show: false },
        padding: [axes.length > 0 ? UNIT_ROOM : null, null, null, null],
        cursor: {
          y: false,
          points: { show: false },
          drag: { x: true, y: false, setScale: false },
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
              plotted.current({
                left: sized.bbox.left / devicePixelRatio,
                width: sized.bbox.width / devicePixelRatio
              })
          ],
          drawClear: [
            (drawn: uPlot): void => drawBackdrop(drawn, backdrop.current, colors, labelFont)
          ],
          draw: [(drawn: uPlot): void => drawUnits(drawn, outward, unitColors, unitFont)],
          setCursor: [
            (hovered: uPlot): void => {
              const { left, top } = hovered.cursor
              if (left === undefined || top === undefined || left < 0) {
                setReadout(undefined)
                return
              }
              setReadout({
                left: hovered.over.offsetLeft + left,
                top: hovered.over.offsetTop + top,
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
          ...Object.fromEntries(
            axes.map(({ unit, scale }) => {
              const range = settings.axes?.[unit]
              return [
                scale,
                range === undefined
                  ? { auto: true }
                  : { auto: false, range: [range.min, range.max] as uPlot.Range.MinMax }
              ]
            })
          )
        },
        axes: [
          {
            ...axis,
            size: 22,
            // Seconds once the ticks are closer than a minute, and
            // milliseconds once they are closer than a second.
            // uPlot hands the tick step fifth, after the axis and its space.
            // Since the start, the time from the log's oldest sample.
            values: (_chart, ticks, _axis, _space, increment) =>
              ticks.map((tick) =>
                settings.time === 'since'
                  ? sinceText(tick - shown.current.origin)
                  : DateTime.fromMillis(tick).toFormat(
                      increment < 1000 ? 'HH:mm:ss.SSS' : increment < 60_000 ? 'HH:mm:ss' : 'HH:mm'
                    )
              )
          },
          // The grid follows the axis nearest the plot.
          ...outward.map(({ scale }, index) => ({
            ...axis,
            scale,
            size: AXIS_SIZE,
            ...(index === 0 ? {} : { grid: { show: false } })
          }))
        ],
        series: [
          {},
          ...lines.map(({ color, scale }) => ({
            stroke: color,
            scale,
            width: 1.5,
            ...drawnAs(settings.drawAs)
          }))
        ]
      }
      const made = new uPlot(options, [[]], box)
      chart.current = made
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
        made.destroy()
        chart.current = null
        // The readout names this chart's lines at this chart's samples.
        setReadout(undefined)
      }
    }, [lines, axes, theme, settings])

    useEffect(() => {
      const current = chart.current
      if (!current) return
      const tables = data.map((series): uPlot.AlignedData => [series.times, series.values])
      backdrop.current = { oldest, gaps }
      joined.current = tables.length === 0 ? [[]] : uPlot.join(tables)
      current.setData(joined.current, false)
      current.setScale('x', { min: from, max: to })
      // New data moves the samples under a cursor that stands still, so its
      // readout is read again.
      const { left, top } = current.cursor
      if (left !== undefined && top !== undefined && left >= 0) current.setCursor({ left, top })
      // The chart made again for a new theme starts empty, so the data goes in again.
    }, [lines, data, from, to, oldest, gaps, theme])

    // The lines' samples at or before the cursor, as the lanes read theirs.
    const index = readout === undefined ? undefined : indexAt(joined.current[0], readout.at)
    const values = index === undefined ? [] : valuesAt(joined.current, index)
    const extraRows = readout === undefined ? [] : readoutRows(readout.at)
    const place =
      readout === undefined
        ? undefined
        : readoutPlace(
            readout.left,
            readout.top,
            container.current?.clientWidth ?? 0,
            container.current?.clientHeight ?? 0,
            // A row for the time, one a line and one a lane.
            READOUT_ROW * (lines.length + extraRows.length + 1) + READOUT_PADDING
          )
    return (
      <Box
        ref={container}
        data-testid="trend-chart"
        sx={{ position: 'relative', flexGrow: 1, minHeight: 0 }}
      >
        {readout !== undefined && place !== undefined && (
          <Box
            data-testid="trend-readout"
            // Where the cursor stops is a new place each time, and a value in
            // `sx` would be a new class each time.
            style={place}
            sx={{
              position: 'absolute',
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
            <Box
              component="span"
              data-testid="trend-readout-time"
              sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
            >
              {settings.time === 'since'
                ? sinceText(readout.at - origin)
                : DateTime.fromMillis(readout.at).toFormat('HH:mm:ss.SSS')}
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
                <Box
                  component="span"
                  data-testid={`trend-readout-value-${index}`}
                  sx={{ fontFamily: 'monospace' }}
                >
                  {figure(values[index])} {line.unit}
                </Box>
              </Box>
            ))}
            {extraRows.map((row) => (
              <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: row.color }} />
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
                  {row.label}
                </Box>
                <Box
                  component="span"
                  data-testid={`trend-readout-lane-${row.key}`}
                  sx={{ fontFamily: 'monospace' }}
                >
                  {row.text}
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
