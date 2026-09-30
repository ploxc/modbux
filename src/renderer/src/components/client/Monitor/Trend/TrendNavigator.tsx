import Box from '@mui/material/Box'
import { formatDuration, formatTime } from '@renderer/components/client/Logging/format'
import { meme } from '@renderer/components/shared/inputs/meme'
import { textMuted } from '@renderer/theme'
import { LogPoint } from '@shared'
import { KeyboardEvent, PointerEvent, useCallback, useEffect, useRef } from 'react'
import { EDGE, Grip, gripAt } from './trendData'

interface TrendNavigatorProps {
  /** What the log holds: its oldest sample, up to now while it runs. */
  start: number
  end: number
  /** The stretch the trend shows. */
  from: number
  to: number
  /** One register's samples over the whole log, drawn raw and faint behind the window. */
  points: LogPoint[]
  color: string
  /** A drag of the window, or of one of its edges, asks for this stretch. */
  onPan: (from: number, to: number) => void
}

/** How far an arrow key pans, as a share of the stretch shown. */
const KEY_PAN = 0.1

const HEIGHT = 30

/**
 * The whole log as a strip under the trend, with the stretch the trend shows
 * as a window on it. Dragging the window pans the trend, dragging an edge
 * zooms it, and the arrow keys pan it while the window holds the focus.
 */
const TrendNavigator = meme(
  ({
    start,
    end,
    from: asked,
    to: until,
    points,
    color,
    onPan
  }: TrendNavigatorProps): JSX.Element => {
    const strip = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const drag = useRef<{ grip: Grip; x: number; from: number; to: number } | null>(null)
    // A range longer than the log starts before it: the window is drawn,
    // and dragged, from where the log starts.
    const from = Math.max(asked, start)
    const to = Math.min(until, end)
    const length = Math.max(end - start, 1)
    const left = ((from - start) / length) * 100
    const width = ((to - from) / length) * 100

    useEffect(() => {
      const drawn = canvas.current
      const context = drawn?.getContext('2d')
      if (!drawn || !context) return
      const ratio = devicePixelRatio
      drawn.width = drawn.clientWidth * ratio
      drawn.height = drawn.clientHeight * ratio
      const read = points.filter(({ error }) => error === undefined)
      const low = Math.min(...read.map(({ value }) => value))
      const high = Math.max(...read.map(({ value }) => value))
      const spread = high - low || 1
      context.clearRect(0, 0, drawn.width, drawn.height)
      context.strokeStyle = color
      context.globalAlpha = 0.55
      context.lineWidth = ratio
      context.beginPath()
      let pen = false
      for (const { time, value, error } of points) {
        if (error !== undefined) {
          pen = false
          continue
        }
        const x = ((time - start) / length) * drawn.width
        const y = drawn.height - ((value - low) / spread) * (drawn.height - 8 * ratio) - 4 * ratio
        if (pen) context.lineTo(x, y)
        else context.moveTo(x, y)
        pen = true
      }
      context.stroke()
    }, [points, color, start, length])

    const handlePointerDown = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        const box = event.currentTarget.getBoundingClientRect()
        const x = event.clientX - box.left
        const grip = gripAt(x, box.width)
        drag.current = { grip, x: event.clientX, from, to }
        event.currentTarget.setPointerCapture(event.pointerId)
      },
      [from, to]
    )

    const handlePointerMove = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        const held = drag.current
        const stripWidth = strip.current?.clientWidth
        if (!held || !stripWidth) return
        const moved = ((event.clientX - held.x) / stripWidth) * length
        if (held.grip === 'window') onPan(held.from + moved, held.to + moved)
        else if (held.grip === 'from') onPan(Math.min(held.from + moved, held.to), held.to)
        else onPan(held.from, Math.max(held.to + moved, held.from))
      },
      [length, onPan]
    )

    const handlePointerUp = useCallback(() => {
      drag.current = null
    }, [])

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
        if (direction === 0) return
        event.preventDefault()
        const moved = direction * (to - from) * KEY_PAN
        onPan(from + moved, to + moved)
      },
      [from, to, onPan]
    )

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.375, flexShrink: 0 }}>
        <Box
          ref={strip}
          data-testid="trend-navigator"
          sx={{
            position: 'relative',
            height: HEIGHT,
            borderRadius: '3px',
            bgcolor: 'action.hover'
          }}
        >
          <Box
            component="canvas"
            ref={canvas}
            sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          />
          <Box
            role="slider"
            tabIndex={0}
            aria-label="The stretch the trend shows"
            aria-valuemin={start}
            aria-valuemax={end}
            aria-valuenow={from}
            aria-valuetext={`${formatTime(from)} to ${formatTime(to)}`}
            data-testid="trend-navigator-window"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            // The window moves on every render while the log runs past the
            // range, and a value in `sx` would be a new class each time.
            style={{
              left: `${Math.max(0, left)}%`,
              width: `${Math.min(100, Math.max(width, 0.5))}%`
            }}
            sx={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              minWidth: EDGE * 2,
              boxSizing: 'border-box',
              border: 1,
              borderColor: 'text.disabled',
              borderRadius: '3px',
              bgcolor: 'action.selected',
              cursor: 'grab',
              touchAction: 'none',
              '&:active': { cursor: 'grabbing' },
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                top: 8,
                bottom: 8,
                width: 3,
                borderRadius: '2px',
                bgcolor: 'text.secondary',
                cursor: 'ew-resize'
              },
              '&::before': { left: 1 },
              '&::after': { right: 1 }
            }}
          />
        </Box>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: textMuted,
            fontFamily: 'monospace'
          }}
        >
          <span>{formatTime(start)}</span>
          <Box component="span" sx={{ fontFamily: 'inherit' }}>
            The whole log · {formatDuration(end - start)}
          </Box>
          <span>{formatTime(end)}</span>
        </Box>
      </Box>
    )
  }
)

export default TrendNavigator
