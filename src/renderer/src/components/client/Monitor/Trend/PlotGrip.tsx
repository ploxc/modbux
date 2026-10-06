import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { PointerEvent, useCallback, useRef } from 'react'
import { GRIP_HEIGHT, PLOT_MIN_HEIGHT } from './trendData'

interface PlotGripProps {
  unit: string
  testId: string
  /** The plot's height as drawn, which a drag starts from. */
  height: number
  /** A drag asks for this height, and a double click for none: a share of the free room. */
  onHeight: (unit: string, height: number | undefined) => void
}

/**
 * The strip under a plot that drags its height, in pixels and never under
 * `PLOT_MIN_HEIGHT`, and a double click hands the plot back its share. A
 * pointer held on it keeps dragging wherever it goes.
 */
const PlotGrip = meme(({ unit, testId, height, onHeight }: PlotGripProps): JSX.Element => {
  const drag = useRef<{ y: number; height: number } | null>(null)

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      drag.current = { y: event.clientY, height }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    [height]
  )
  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const held = drag.current
      if (!held) return
      onHeight(unit, Math.max(PLOT_MIN_HEIGHT, Math.round(held.height + event.clientY - held.y)))
    },
    [unit, onHeight]
  )
  const handlePointerUp = useCallback(() => {
    drag.current = null
  }, [])
  const handleDoubleClick = useCallback(() => onHeight(unit, undefined), [unit, onHeight])

  return (
    <Box
      role="separator"
      aria-orientation="horizontal"
      aria-label="The plot's height"
      data-testid={testId}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      sx={{
        height: GRIP_HEIGHT,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'row-resize',
        touchAction: 'none',
        '&::after': {
          content: '""',
          width: 32,
          height: 3,
          borderRadius: '2px',
          bgcolor: 'divider'
        },
        '&:hover::after': { bgcolor: 'text.secondary' }
      }}
    />
  )
})

export default PlotGrip
