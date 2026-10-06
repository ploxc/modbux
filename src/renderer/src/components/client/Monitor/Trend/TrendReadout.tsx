import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { LogPoint, TrendSettings } from '@shared'
import { DateTime } from 'luxon'
import { RefObject } from 'react'
import { TrendLane } from './TrendLanes'
import { TrendLine } from './TrendPlot'
import {
  figure,
  laneAt,
  READOUT_PADDING,
  READOUT_ROW,
  READOUT_WIDTH,
  readoutPlace,
  sinceText,
  TrendSeries,
  valueAt
} from './trendData'
import { useTrendReadoutZustand } from './trendReadout.zustand'

/** A line the readout reads: its key, how it is named and drawn, and its points. */
interface ReadoutLine {
  key: string
  line: TrendLine
  series: TrendSeries
}

interface TrendReadoutProps {
  /** The box the readout is placed in, which it never leaves. */
  room: RefObject<HTMLDivElement>
  /** Every line drawn, in plot order. */
  lines: ReadoutLine[]
  lanes: TrendLane[]
  runEnds: number[]
  time: TrendSettings['time']
  /** The moment the time since the start counts from: the log's oldest sample. */
  origin: number
}

/** A row of the readout: a line's value, or a lane's state. */
interface ReadoutRow {
  key: string
  testId: string
  label: string
  color: string
  text: string
  /** A lane's swatch is a square, a line's a dash. */
  lane: boolean
}

/** A lane's sample as the readout writes it: on or off, or the word in hex. */
const laneText = (bitmap: boolean, point: LogPoint | undefined): string => {
  if (point === undefined || point.error !== undefined) return '–'
  if (bitmap) return `0x${point.value.toString(16).padStart(4, '0')}`
  return point.value === 0 ? 'off' : 'on'
}

const NAME_SX = {
  flexGrow: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} as const

/**
 * The moment under the cursor, and every line's value and every lane's state
 * at it: the last sample at or before it, and none once a lane's run ended
 * between the two. It alone follows the cursor, so a cursor that moves
 * renders the readout and nothing else of the trend.
 */
const TrendReadout = meme(
  ({ room, lines, lanes, runEnds, time, origin }: TrendReadoutProps): JSX.Element | null => {
    const cursor = useTrendReadoutZustand((z) => z.cursor)
    const box = room.current?.getBoundingClientRect()
    if (cursor === undefined || box === undefined) return null
    const { at } = cursor
    const rows = [
      ...lines.map(({ key, line, series }, index): ReadoutRow => {
        const value = figure(valueAt(series, at))
        return {
          key,
          testId: `trend-readout-value-${index}`,
          label: line.label,
          color: line.color,
          text: line.unit === '' ? value : `${value} ${line.unit}`,
          lane: false
        }
      }),
      ...lanes.map(
        (lane): ReadoutRow => ({
          key: lane.key,
          testId: `trend-readout-lane-${lane.key}`,
          label: lane.label,
          color: lane.bitmap ? 'text.secondary' : lane.color,
          text: laneText(lane.bitmap, laneAt(lane.points, runEnds, at)),
          lane: true
        })
      )
    ]
    const place = readoutPlace(
      cursor.x - box.left,
      cursor.y - box.top,
      box.width,
      box.height,
      // A row for the time, and one a line and a lane.
      READOUT_ROW * (rows.length + 1) + READOUT_PADDING
    )

    return (
      <Box
        data-testid="trend-readout"
        // Where the cursor stops is a new place each time, and a value in `sx`
        // would be a new class each time.
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
          {time === 'since'
            ? sinceText(at - origin)
            : DateTime.fromMillis(at).toFormat('HH:mm:ss.SSS')}
        </Box>
        {rows.map((row) => (
          <Box key={row.key} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{ width: 8, height: row.lane ? 8 : 3, borderRadius: '2px', bgcolor: row.color }}
            />
            <Box component="span" sx={NAME_SX}>
              {row.label}
            </Box>
            <Box component="span" data-testid={row.testId} sx={{ fontFamily: 'monospace' }}>
              {row.text}
            </Box>
          </Box>
        ))}
      </Box>
    )
  }
)

export default TrendReadout
