import Replay from '@mui/icons-material/Replay'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { alpha, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { AxisRange, TrendSettings } from '@shared'
import {
  axisScale,
  figure,
  panBy,
  pinchFactor,
  touchView,
  zoomBase,
  TrendGap,
  TrendSeries,
  wheelFactor,
  wheelPixels,
  zoomAround,
  zoomAxis
} from './trendData'
import { TrendStretch } from './trendPanel.zustand'

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
  /** Which plot it is, from the top, which its axis's test ids carry. */
  index?: number
  /** The lines, which the plot is made for; a new array makes it again. */
  lines: TrendLine[]
  /** Each line's points, in the order of `lines`. */
  data: TrendSeries[]
  /** The engineering unit its axis is of; none for a plot under the lanes, which has no axis. */
  unit: string | undefined
  /** The range its axis is held at, zoomed to or fixed, or none to fit what it draws. */
  range: AxisRange | undefined
  /** Whether its axis is zoomed or panned, and what its reset hands it back to. */
  axisZoomed?: boolean
  resetLabel?: 'Auto' | 'Fixed'
  /** A wheel or a drag over the axis asks for this range, and its reset for none. */
  onAxisZoom?: (unit: string, range: AxisRange | undefined) => void
  drawAs: TrendSettings['drawAs']
  /** The time range drawn, which runs past the last sample while it is live. */
  from: number
  to: number
  /** Where the log's oldest sample is: the range before it is hatched, and a zoom starts from it. */
  oldest: number | undefined
  /** Where the log took no samples, each shaded and named by why. */
  gaps: TrendGap[]
  /** The wheel, a pinch, a sideways swipe, a shift-drag or a touch asks for this stretch. */
  onZoom: (from: number, to: number) => void
  /** The stretch selected, drawn as a band. */
  selection: TrendStretch | undefined
  /** A drag across the plot selects a stretch, and a click that does not drag selects none. */
  onSelect: (selection: TrendStretch | undefined) => void
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

/** How many pixels a drag must cover to select, so a click does not. */
const SHORTEST_DRAG = 4

/** What a plot draws behind its lines, read by its hook on every draw. */
interface Backdrop {
  oldest: number | undefined
  gaps: TrendGap[]
}

/** The selected stretch as a band over the plot, with a line at each edge. */
const drawBand = (
  chart: uPlot,
  selection: TrendStretch | undefined,
  colors: { band: string; edge: string }
): void => {
  if (selection === undefined) return
  const { ctx, bbox } = chart
  const left = chart.valToPos(selection.from, 'x', true)
  const right = chart.valToPos(selection.to, 'x', true)
  ctx.save()
  ctx.beginPath()
  ctx.rect(bbox.left, bbox.top, bbox.width, bbox.height)
  ctx.clip()
  ctx.fillStyle = colors.band
  ctx.fillRect(left, bbox.top, right - left, bbox.height)
  ctx.strokeStyle = colors.edge
  ctx.lineWidth = devicePixelRatio
  ctx.beginPath()
  for (const x of [left, right]) {
    ctx.moveTo(x, bbox.top)
    ctx.lineTo(x, bbox.top + bbox.height)
  }
  ctx.stroke()
  ctx.restore()
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
    index = 0,
    lines,
    data,
    unit,
    range,
    axisZoomed = false,
    resetLabel = 'Auto',
    onAxisZoom,
    drawAs,
    from,
    to,
    oldest,
    gaps,
    onZoom,
    selection,
    onSelect,
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
    const select = useRef(onSelect)
    select.current = onSelect
    const band = useRef(selection)
    const zoomOut = useRef(onZoomOut)
    zoomOut.current = onZoomOut
    const cursorMoved = useRef(onCursor)
    cursorMoved.current = onCursor
    const plotted = useRef(onPlot)
    plotted.current = onPlot
    const handed = useRef(onChart)
    handed.current = onChart
    const axisZoomTo = useRef(onAxisZoom)
    axisZoomTo.current = onAxisZoom
    const axisArea = useRef<HTMLDivElement>(null)
    const axisDrag = useRef<{ y: number; range: AxisRange; height: number } | null>(null)
    const shown = useRef({ from, to })
    shown.current = { from, to }
    const base = useRef(zoomBase(from, to, oldest))
    base.current = zoomBase(from, to, oldest)
    const held = useRef(range)
    held.current = range

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
      const crossColor = theme.palette.text.secondary
      const bandColors = {
        band: alpha(theme.palette.info.main, 0.1),
        edge: alpha(theme.palette.info.main, 0.6)
      }
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
            // A drag shows its box in every plot as it goes; a double click is
            // the trend's own, and uPlot's would fit x to the data.
            filters: { pub: (type) => type !== 'dblclick' }
          },
          // In place of uPlot's own, which fits x to the data and so to the
          // margin a zoomed trend asks either side of its stretch.
          // A press with Shift held pans the time rather than selecting.
          bind: {
            dblclick: () => () => {
              zoomOut.current()
              return null
            },
            mousedown: (_self, _target, handler) => (event) => {
              if (!event.shiftKey) return handler(event)
              startPan(event.clientX)
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
              drawBand(drawn, band.current, bandColors)
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
              if (hovered.cursor.event == null) {
                crosshair.style.display = 'none'
                tag.style.display = 'none'
                return
              }
              const { left, top } = hovered.cursor
              if (left === undefined || top === undefined || left < 0) {
                crosshair.style.display = 'none'
                tag.style.display = 'none'
                cursorMoved.current(undefined)
                return
              }
              // The plot under the pointer reads its value off its axis.
              if (scale !== undefined && hovered.scales[scale]?.min != null) {
                crosshair.style.display = 'block'
                crosshair.style.top = `${top}px`
                tag.style.display = 'block'
                tag.style.top = `${hovered.over.offsetTop + top - 8}px`
                tag.textContent = figure(hovered.posToVal(top, scale))
              }
              const over = hovered.over.getBoundingClientRect()
              cursorMoved.current({
                x: over.left + left,
                y: over.top + top,
                at: hovered.posToVal(left, 'x')
              })
            }
          ],
          // The band every plot draws takes the place of uPlot's own box. The
          // plot dragged across selects; the plots its drag is synced to have
          // no event of their own.
          setSelect: [
            (selected: uPlot): void => {
              const { left, width } = selected.select
              selected.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false)
              if (selected.cursor.event == null || width < SHORTEST_DRAG) return
              select.current({
                from: selected.posToVal(left, 'x'),
                to: selected.posToVal(left + width, 'x')
              })
            }
          ]
        },
        scales: {
          x: { time: true },
          // A unit held at a range, zoomed or fixed, draws it whatever its
          // lines hold; otherwise uPlot's own fit. Read through a ref, so a
          // new range takes the next draw rather than a new plot.
          ...(scale === undefined
            ? {}
            : {
                [scale]: {
                  auto: true,
                  range: (_self: uPlot, dataMin: number, dataMax: number): uPlot.Range.MinMax => {
                    const kept = held.current
                    if (kept !== undefined) return [kept.min, kept.max]
                    return dataMin == null
                      ? [null, null]
                      : uPlot.rangeNum(dataMin, dataMax, 0.1, true)
                  }
                }
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
      // A horizontal dashed line at the pointer, and its value on the axis.
      const crosshair = document.createElement('div')
      Object.assign(crosshair.style, {
        position: 'absolute',
        left: '0',
        right: '0',
        height: '0',
        borderTop: `1px dashed ${crossColor}`,
        pointerEvents: 'none',
        display: 'none'
      })
      const tag = document.createElement('div')
      Object.assign(tag.style, {
        position: 'absolute',
        left: '0',
        width: `${AXIS_SIZE - 2}px`,
        boxSizing: 'border-box',
        padding: '0 4px',
        textAlign: 'right',
        font: `10px ${theme.typography.fontFamily ?? 'sans-serif'}`,
        lineHeight: '16px',
        borderRadius: '2px',
        color: theme.palette.text.primary,
        background: theme.palette.action.selected,
        pointerEvents: 'none',
        zIndex: '1',
        display: 'none'
      })

      /** A drag of the time from `startX`, moving the stretch as the pointer moves. */
      const startPan = (startX: number): void => {
        const start = shown.current
        const width = made.over.clientWidth
        const handleMove = (event: MouseEvent): void => {
          const panned = panBy(start.from, start.to, -(event.clientX - startX) / width)
          zoom.current(panned.from, panned.to)
        }
        const handleUp = (): void => {
          window.removeEventListener('mousemove', handleMove)
          window.removeEventListener('mouseup', handleUp)
        }
        window.addEventListener('mousemove', handleMove)
        window.addEventListener('mouseup', handleUp)
      }

      const made = new uPlot(options, [[]], box)
      made.over.appendChild(crosshair)
      made.root.appendChild(tag)
      chart.current = made
      if (unit !== undefined) handed.current?.(unit, made)
      // A pinch is the wheel with Control; the wheel itself scrolls the
      // plots, and the navigator zooms and pans.
      const handleWheel = (event: WheelEvent): void => {
        if (!event.ctrlKey) return
        event.preventDefault()
        const { from: baseFrom, to: baseTo } = base.current
        const at = made.posToVal(event.offsetX, 'x')
        const next = zoomAround(baseFrom, baseTo, at, pinchFactor(event.deltaY))
        zoom.current(next.from, next.to)
      }
      made.over.addEventListener('wheel', handleWheel, { passive: false })

      // On a touchscreen one finger pans, and two zoom around their middle.
      made.over.style.touchAction = 'none'
      const touches = new Map<number, { x: number; y: number }>()
      let touchStart:
        | { view: { from: number; to: number }; scaled: number; x: number; spread: number }
        | undefined
      // Where the fingers' middle is across, and how far apart the first two are.
      const touchState = (): { x: number; spread: number } => {
        const pair = [...touches.values()].slice(0, 2)
        const xs = pair.map(({ x }) => x)
        const [first, second] = pair
        return {
          x: (Math.min(...xs) + Math.max(...xs)) / 2,
          // A second finger, however close, makes it a pinch.
          spread:
            first && second
              ? Math.max(Math.hypot(second.x - first.x, second.y - first.y), Number.EPSILON)
              : 0
        }
      }
      const handleTouchDown = (event: PointerEvent): void => {
        if (event.pointerType !== 'touch') return
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        touchStart = {
          view: shown.current,
          scaled: base.current.to - base.current.from,
          ...touchState()
        }
      }
      const handleTouchMove = (event: PointerEvent): void => {
        if (event.pointerType !== 'touch' || !touches.has(event.pointerId) || !touchStart) return
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const left = made.over.getBoundingClientRect().left
        const now = touchState()
        const next = touchView(
          touchStart.view,
          { x: touchStart.x - left, spread: touchStart.spread },
          { x: now.x - left, spread: now.spread },
          made.over.clientWidth,
          touchStart.scaled
        )
        zoom.current(next.from, next.to)
      }
      const handleTouchUp = (event: PointerEvent): void => {
        if (!touches.delete(event.pointerId)) return
        touchStart =
          touches.size > 0
            ? { view: shown.current, scaled: base.current.to - base.current.from, ...touchState() }
            : undefined
      }
      made.over.addEventListener('pointerdown', handleTouchDown)
      made.over.addEventListener('pointermove', handleTouchMove)
      made.over.addEventListener('pointerup', handleTouchUp)
      made.over.addEventListener('pointercancel', handleTouchUp)

      // The wheel over the axis zooms it around the value under the pointer.
      const axisBox = axisArea.current
      const handleAxisWheel = (event: WheelEvent): void => {
        const held = scale === undefined ? undefined : made.scales[scale]
        if (unit === undefined || scale === undefined || held?.min == null || held.max == null)
          return
        if (event.deltaY === 0) return
        event.preventDefault()
        const at = made.posToVal(event.clientY - made.over.getBoundingClientRect().top, scale)
        const factor = wheelFactor(
          wheelPixels(event.deltaY, event.deltaMode, made.over.clientHeight)
        )
        axisZoomTo.current?.(unit, zoomAxis({ min: held.min, max: held.max }, at, factor))
      }
      axisBox?.addEventListener('wheel', handleAxisWheel, { passive: false })
      // A press that lets go where it went down clears the selection. uPlot
      // swallows the click after what it takes for a drag, which a move it
      // has not handled yet can be, so the press is read off its own ends.
      let pressedAt = 0
      const handlePress = (event: PointerEvent): void => {
        pressedAt = event.clientX
      }
      const handleRelease = (event: PointerEvent): void => {
        if (Math.abs(event.clientX - pressedAt) < SHORTEST_DRAG) select.current(undefined)
      }
      made.over.addEventListener('pointerdown', handlePress)
      made.over.addEventListener('pointerup', handleRelease)
      const observer = new ResizeObserver(() =>
        made.setSize({ width: box.clientWidth, height: box.clientHeight })
      )
      observer.observe(box)
      return (): void => {
        made.over.removeEventListener('wheel', handleWheel)
        made.over.removeEventListener('pointerdown', handleTouchDown)
        made.over.removeEventListener('pointermove', handleTouchMove)
        made.over.removeEventListener('pointerup', handleTouchUp)
        made.over.removeEventListener('pointercancel', handleTouchUp)
        axisBox?.removeEventListener('wheel', handleAxisWheel)
        made.over.removeEventListener('pointerdown', handlePress)
        made.over.removeEventListener('pointerup', handleRelease)
        observer.disconnect()
        // A plot gone from under the cursor leaves no readout behind.
        if (made.cursor.event != null && (made.cursor.left ?? -1) >= 0)
          cursorMoved.current(undefined)
        made.destroy()
        chart.current = null
        if (unit !== undefined) handed.current?.(unit, null)
      }
    }, [syncKey, lines, unit, drawAs, theme])

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

    useEffect(() => {
      band.current = selection
      chart.current?.redraw(false, false)
    }, [selection])

    // A drag along the axis pans it.
    const handleAxisDown = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const held = unit === undefined ? undefined : chart.current?.scales[axisScale(unit)]
        const over = chart.current?.over
        if (held?.min == null || held.max == null || over === undefined) return
        axisDrag.current = {
          y: event.clientY,
          range: { min: held.min, max: held.max },
          height: over.clientHeight
        }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      [unit]
    )
    const handleAxisMove = useCallback(
      (event: ReactPointerEvent<HTMLDivElement>) => {
        const held = axisDrag.current
        // A press that has not moved, a double click's among them, pans nothing.
        if (!held || unit === undefined || Math.abs(event.clientY - held.y) < SHORTEST_DRAG) return
        const shift = ((event.clientY - held.y) / held.height) * (held.range.max - held.range.min)
        axisZoomTo.current?.(unit, { min: held.range.min + shift, max: held.range.max + shift })
      },
      [unit]
    )
    // A double click on a zoomed axis hands it back to Auto or Fixed.
    const handleAxisDoubleClick = useCallback(() => {
      if (unit !== undefined && axisZoomed) axisZoomTo.current?.(unit, undefined)
    }, [unit, axisZoomed])
    const handleAxisUp = useCallback(() => {
      axisDrag.current = null
    }, [])
    const handleReset = useCallback(() => {
      if (unit !== undefined) axisZoomTo.current?.(unit, undefined)
    }, [unit])

    return (
      <Box sx={{ position: 'absolute', inset: 0 }}>
        <Box
          ref={container}
          // No minimum of its own: uPlot's canvas inside it holds the size it
          // was last given, and the observer above sees no less. The box a
          // drag draws looks as the band it leaves does.
          sx={{
            position: 'absolute',
            inset: 0,
            '& .u-select': {
              bgcolor: (theme) => alpha(theme.palette.info.main, 0.1),
              borderLeft: 1,
              borderRight: 1,
              borderColor: (theme) => alpha(theme.palette.info.main, 0.6)
            }
          }}
        />
        {unit !== undefined && (
          <Box
            ref={axisArea}
            data-testid={`trend-plot-axis-${index}`}
            onPointerDown={handleAxisDown}
            onPointerMove={handleAxisMove}
            onPointerUp={handleAxisUp}
            onDoubleClick={handleAxisDoubleClick}
            sx={{
              position: 'absolute',
              left: 0,
              top: UNIT_ROOM,
              bottom: 0,
              width: AXIS_SIZE,
              borderRadius: '3px',
              cursor: 'ns-resize',
              touchAction: 'none',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          />
        )}
        {unit !== undefined && axisZoomed && (
          <ButtonBase
            data-testid={`trend-plot-reset-${index}`}
            aria-label={`Back to ${resetLabel}`}
            title={`Back to ${resetLabel}`}
            onClick={handleReset}
            sx={{
              position: 'absolute',
              left: AXIS_SIZE + 6,
              top: 0,
              height: 16,
              px: 0.75,
              gap: 0.5,
              border: 1,
              borderColor: 'divider',
              borderRadius: '8px',
              bgcolor: 'background.paper',
              fontSize: 10.5,
              color: 'text.secondary'
            }}
          >
            <Replay sx={{ fontSize: 11 }} />
            {resetLabel}
          </ButtonBase>
        )}
      </Box>
    )
  }
)

export default TrendPlot
