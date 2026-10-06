import type uPlot from 'uplot'
import { BAR_HEIGHT, BAR_TOP, LABEL_HEIGHT, LANE_HEIGHT, LaneRow } from './TrendLanes'
import { AXIS_SIZE, PLOT_RIGHT } from './TrendPlot'
import { TrendStretch } from './trendPanel.zustand'

/** Pixels, at the device's scale, of the image's margin and of a row of its heading. */
const MARGIN = 12
const ROW = 20

/** What the image says and in which colours: the trend's name, its stretch and the theme's. */
export interface TrendImageText {
  title: string
  /** The stretch shown, as the heading writes it. */
  stretch: string
  background: string
  foreground: string
  muted: string
  /** The lanes' bar under what lights it, and the selection's band and edges. */
  bar: string
  band: string
  edge: string
  font: string
}

/** An entry of the legend: a register's colour and name. */
export interface LegendEntry {
  color: string
  label: string
}

/** One entry of the legend, placed: where its swatch starts, and on which row. */
interface Placed {
  entry: LegendEntry
  x: number
  row: number
}

/**
 * The legend's entries, each after the last on its row and on the next row
 * once the row is `width` wide, as `measure` writes each label.
 */
export const legendRows = (
  entries: readonly LegendEntry[],
  width: number,
  measure: (label: string) => number,
  swatch: number,
  gap: number
): Placed[] => {
  const placed: Placed[] = []
  let x = 0
  let row = 0
  for (const entry of entries) {
    const wide = swatch + measure(entry.label)
    if (x > 0 && x + wide > width) {
      x = 0
      row++
    }
    placed.push({ entry, x, row })
    x += wide + gap
  }
  return placed
}

/**
 * The blocks of the image one under the other from `top` down, `gap` apart,
 * each with where it starts, and how tall the image is with `bottom` under
 * the last.
 */
export const imageLayout = <T extends { height: number }>(
  blocks: readonly T[],
  top: number,
  gap: number,
  bottom: number
): { placed: (T & { y: number })[]; height: number } => {
  const placed: (T & { y: number })[] = []
  let y = top
  for (const block of blocks) {
    if (placed.length > 0) y += gap
    placed.push({ ...block, y })
    y += block.height
  }
  return { placed, height: y + bottom }
}

/** What the image draws of the trend. */
export interface TrendImageParts {
  /** The plots shown, top to bottom. */
  plots: uPlot[]
  /** The lanes' rows, opened bitmaps opened. */
  lanes: LaneRow[]
  timeAxis: uPlot
  /** The stretch shown, which the lanes' bars are drawn over. */
  from: number
  to: number
  selection: TrendStretch | undefined
  legend: LegendEntry[]
}

/**
 * The trend as a PNG, everything it shows and not only what its scroll has
 * in view: a heading of its name and its stretch, a legend of the registers
 * shown, wrapped onto as many rows as it takes, every plot as drawn, the
 * lanes drawn from their rows on the plots' time, the selection's band over
 * them, and the time axis. Drawn at the plots' own resolution, so it is as
 * sharp as the screen.
 */
export const trendImage = (parts: TrendImageParts, text: TrendImageText): Promise<Blob | null> => {
  const ratio = devicePixelRatio
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return Promise.resolve(null)
  const axisCanvas = parts.timeAxis.ctx.canvas
  const inner = axisCanvas.width

  const legendFont = `${11 * ratio}px ${text.font}`
  context.font = legendFont
  const placed = legendRows(
    parts.legend,
    inner,
    (label) => context.measureText(label).width,
    14 * ratio,
    16 * ratio
  )
  const legendRowCount = placed.reduce((most, { row }) => Math.max(most, row + 1), 0)
  const heading = (MARGIN + ROW * (2 + legendRowCount)) * ratio
  const lanesHeight = parts.lanes.length * LANE_HEIGHT * ratio
  const drawLanes = (top: number): void => {
    const left = (MARGIN + AXIS_SIZE) * ratio
    const width = inner - (AXIS_SIZE + PLOT_RIGHT) * ratio
    const length = parts.to - parts.from
    const xOf = (time: number): number =>
      left + Math.min(width, Math.max(0, ((time - parts.from) / length) * width))
    context.font = `${10.5 * ratio}px ${text.font}`
    context.textBaseline = 'middle'
    for (const [index, row] of parts.lanes.entries()) {
      const rowTop = top + index * LANE_HEIGHT * ratio
      context.fillStyle = row.indent ? text.muted : text.foreground
      context.fillText(
        row.label,
        left + (row.indent ? 16 * ratio : 0),
        rowTop + (LABEL_HEIGHT / 2 - 1) * ratio,
        width
      )
      const barTop = rowTop + BAR_TOP * ratio
      context.fillStyle = text.bar
      context.fillRect(left, barTop, width, BAR_HEIGHT * ratio)
      context.globalAlpha = 0.75
      context.fillStyle = row.color
      for (const { start, end } of row.spans) {
        if (end <= parts.from || start >= parts.to) continue
        const x = xOf(start)
        // A stretch shorter than a pixel still shows.
        context.fillRect(x, barTop, Math.max(xOf(end) - x, ratio), BAR_HEIGHT * ratio)
      }
      context.globalAlpha = 1
    }
    if (parts.selection === undefined) return
    const bandLeft = xOf(parts.selection.from)
    const bandRight = xOf(parts.selection.to)
    context.fillStyle = text.band
    context.fillRect(bandLeft, top, bandRight - bandLeft, lanesHeight)
    context.fillStyle = text.edge
    context.fillRect(bandLeft, top, ratio, lanesHeight)
    context.fillRect(bandRight, top, ratio, lanesHeight)
  }
  const canvasAt =
    (source: HTMLCanvasElement) =>
    (top: number): void =>
      context.drawImage(source, MARGIN * ratio, top)
  const layout = imageLayout(
    [
      ...parts.plots.map((plot) => ({
        height: plot.ctx.canvas.height,
        draw: canvasAt(plot.ctx.canvas)
      })),
      ...(parts.lanes.length > 0 ? [{ height: lanesHeight, draw: drawLanes }] : []),
      { height: axisCanvas.height, draw: canvasAt(axisCanvas) }
    ],
    heading,
    0,
    MARGIN * ratio
  )
  // Sizing a canvas clears its context, so the drawing starts here.
  canvas.width = inner + 2 * MARGIN * ratio
  canvas.height = layout.height

  context.fillStyle = text.background
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.textBaseline = 'middle'
  context.font = `${13 * ratio}px ${text.font}`
  context.fillStyle = text.foreground
  context.fillText(text.title, MARGIN * ratio, (MARGIN + ROW / 2) * ratio, inner)
  context.font = `${11 * ratio}px ${text.font}`
  context.fillStyle = text.muted
  context.fillText(text.stretch, MARGIN * ratio, (MARGIN + ROW * 1.5) * ratio, inner)
  context.font = legendFont
  for (const { entry, x, row } of placed) {
    const left = MARGIN * ratio + x
    const y = (MARGIN + ROW * (2.5 + row)) * ratio
    context.fillStyle = entry.color
    context.fillRect(left, y - 1.5 * ratio, 10 * ratio, 3 * ratio)
    context.fillStyle = text.foreground
    context.fillText(entry.label, left + 14 * ratio, y, Math.max(0, inner - x - 14 * ratio))
  }
  for (const { y, draw } of layout.placed) draw(y)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
