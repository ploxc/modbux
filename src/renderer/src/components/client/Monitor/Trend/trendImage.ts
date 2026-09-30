import type uPlot from 'uplot'
import { TrendLine } from './TrendChart'

/** Pixels, at the device's scale, of the image's margin and of a row of its heading. */
const MARGIN = 12
const ROW = 20

export interface TrendImageText {
  title: string
  /** The stretch shown, as the heading writes it. */
  stretch: string
  background: string
  foreground: string
  muted: string
  font: string
}

/** One entry of the legend, placed: where its swatch starts, and on which row. */
interface Placed {
  line: TrendLine
  x: number
  row: number
}

/**
 * The legend's entries, each after the last on its row and on the next row
 * once the row is `width` wide, as `measure` writes each label.
 */
export const legendRows = (
  lines: readonly TrendLine[],
  width: number,
  measure: (label: string) => number,
  swatch: number,
  gap: number
): Placed[] => {
  const placed: Placed[] = []
  let x = 0
  let row = 0
  for (const line of lines) {
    const wide = swatch + measure(line.label)
    if (x > 0 && x + wide > width) {
      x = 0
      row++
    }
    placed.push({ line, x, row })
    x += wide + gap
  }
  return placed
}

/**
 * The chart as a PNG with a heading above it: the trend's name, the stretch
 * shown on a row of its own, and a legend of each line's colour and name,
 * wrapped onto as many rows as it takes, all as wide as the chart at most. Drawn at the chart canvas's own resolution, so the image
 * is as sharp as the screen.
 */
export const trendImage = (
  chart: uPlot,
  lines: readonly TrendLine[],
  text: TrendImageText
): Promise<Blob | null> => {
  const source = chart.ctx.canvas
  const ratio = devicePixelRatio
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context === null) return Promise.resolve(null)

  const inner = source.width
  const legendFont = `${11 * ratio}px ${text.font}`
  context.font = legendFont
  const placed = legendRows(
    lines,
    inner,
    (label) => context.measureText(label).width,
    14 * ratio,
    16 * ratio
  )
  const rows = placed.reduce((most, { row }) => Math.max(most, row + 1), 0)
  const heading = (MARGIN + ROW * (2 + rows)) * ratio
  // Sizing a canvas clears its context, so the drawing starts here.
  canvas.width = inner + 2 * MARGIN * ratio
  canvas.height = source.height + heading + MARGIN * ratio

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
  for (const { line, x, row } of placed) {
    const left = MARGIN * ratio + x
    const y = (MARGIN + ROW * (2.5 + row)) * ratio
    context.fillStyle = line.color
    context.fillRect(left, y - 1.5 * ratio, 10 * ratio, 3 * ratio)
    context.fillStyle = text.foreground
    context.fillText(line.label, left + 14 * ratio, y, Math.max(0, inner - x - 14 * ratio))
  }

  context.drawImage(source, MARGIN * ratio, heading)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
