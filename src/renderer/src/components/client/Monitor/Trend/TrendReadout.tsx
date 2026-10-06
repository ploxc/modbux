import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { READOUT_WIDTH } from './trendData'

/** A row of the readout: a line's value, or a lane's state. */
export interface ReadoutRow {
  key: string
  testId: string
  label: string
  color: string
  text: string
  /** A lane's swatch is a square, a line's a dash. */
  lane: boolean
}

interface TrendReadoutProps {
  /** Where the box goes, in pixels of the room it is placed in. */
  place: { left: number; top: number }
  time: string
  rows: ReadoutRow[]
}

const NAME_SX = {
  flexGrow: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
} as const

/** The moment under the cursor, and every line's value and every lane's state at it. */
const TrendReadout = meme(
  ({ place, time, rows }: TrendReadoutProps): JSX.Element => (
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
        {time}
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
)

export default TrendReadout
