import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { textMuted } from '@renderer/theme'
import { BitColor, LogPoint, RegisterMapValue, RegisterType } from '@shared'
import { useCallback, useState } from 'react'
import { bitOn, bitsOf, LaneSpan, laneSpans } from './trendData'

/** A register the trend draws as a lane: a bit, or a bitmap's word. */
export interface TrendLane {
  key: string
  type: RegisterType
  address: number
  label: string
  color: string
  bitmap: boolean
  mapValue: RegisterMapValue | undefined
  points: LogPoint[]
}

/** Where the chart's plot sits in its box, which the lanes line up with. */
export interface PlotBox {
  left: number
  width: number
}

interface TrendLanesProps {
  lanes: TrendLane[]
  runEnds: number[]
  /** Where an open stretch ends: now while the log runs, else where it stopped. */
  end: number
  from: number
  to: number
  plot: PlotBox
}

/** A lane's row: a name over a bar that is lit where the bit was on. */
interface Row {
  key: string
  label: string
  color: string
  spans: LaneSpan[]
  indent: boolean
}

/** The press that opens a bitmap's lane into its bits, and closes it. */
const LaneToggle = meme(
  ({
    laneKey,
    testId,
    expanded,
    onToggle
  }: {
    laneKey: string
    testId: string
    expanded: boolean
    onToggle: (key: string) => void
  }): JSX.Element => {
    const handleClick = useCallback(() => onToggle(laneKey), [laneKey, onToggle])
    return (
      <IconButton
        size="small"
        aria-label={expanded ? 'Close the bits' : 'Open the bits'}
        aria-expanded={expanded}
        data-testid={testId}
        onClick={handleClick}
        sx={{ p: 0 }}
      >
        {expanded ? <ExpandMore sx={{ fontSize: 14 }} /> : <ChevronRight sx={{ fontSize: 14 }} />}
      </IconButton>
    )
  }
)

const ROW_HEIGHT = 22
const BAR_TOP = 12
const BAR_HEIGHT = 8

/** The bar's path over `from` to `to` in a box `width` wide: a rectangle a stretch. */
const barPath = (spans: LaneSpan[], from: number, to: number, width: number): string => {
  const length = to - from
  const xOf = (time: number): number =>
    Math.min(width, Math.max(0, ((time - from) / length) * width))
  return spans
    .filter(({ start, end }) => end > from && start < to)
    .map(({ start, end }) => {
      const left = xOf(start)
      // A stretch shorter than a pixel still shows.
      const right = Math.max(xOf(end), left + 1)
      return `M${left} 0H${right}V${BAR_HEIGHT}H${left}Z`
    })
    .join('')
}

/**
 * The bits and bitmaps of the trend as lanes under its lines, on the chart's
 * time axis. A bit's lane is lit where it was on; a bitmap's where any bit
 * was set, and it opens into a lane a bit, for every bit its settings name
 * and every bit that was set, lit as its settings say: inverted, a bit is on
 * while clear, and a warning or error bit takes that colour.
 */
const TrendLanes = meme(({ lanes, runEnds, end, from, to, plot }: TrendLanesProps): JSX.Element => {
  const theme = useTheme()
  const [open, setOpen] = useState<string[]>([])
  const toggle = useCallback((key: string) => {
    setOpen((opened) =>
      opened.includes(key) ? opened.filter((each) => each !== key) : [...opened, key]
    )
  }, [])
  const bitColor = (color: BitColor | undefined, fallback: string): string =>
    color === 'error'
      ? theme.palette.error.main
      : color === 'warning'
        ? theme.palette.warning.main
        : fallback

  return (
    <Box data-testid="trend-lanes" sx={{ display: 'flex', flexDirection: 'column' }}>
      {lanes.map((lane) => {
        const expanded = lane.bitmap && open.includes(lane.key)
        const rows: Row[] = [
          {
            key: lane.key,
            label: lane.label,
            color: lane.bitmap ? theme.palette.text.secondary : lane.color,
            spans: laneSpans(lane.points, runEnds, (value) => value !== 0, end),
            indent: false
          },
          ...(expanded
            ? bitsOf(lane.mapValue?.bitMap, lane.points).map((bit): Row => {
                const settings = lane.mapValue?.bitMap?.[String(bit)]
                return {
                  key: `${lane.key}|${bit}`,
                  label: settings?.comment ? `bit ${bit} · ${settings.comment}` : `bit ${bit}`,
                  color: bitColor(settings?.color, lane.color),
                  spans: laneSpans(
                    lane.points,
                    runEnds,
                    (value) => bitOn(value, bit, settings?.invert),
                    end
                  ),
                  indent: true
                }
              })
            : [])
        ]
        return rows.map((row) => (
          <Box
            key={row.key}
            data-testid={`trend-lane-${row.key}`}
            sx={{ position: 'relative', height: ROW_HEIGHT, flexShrink: 0 }}
          >
            <Box
              sx={{
                position: 'absolute',
                top: -1,
                // A bitmap's toggle sits left of the plot, its name at the plot's
                // edge, and inside the panel when the plot has no axis left of it.
                left: row.indent
                  ? plot.left + 16
                  : lane.bitmap
                    ? Math.max(0, plot.left - 16)
                    : plot.left,
                right: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                fontSize: 10.5,
                lineHeight: '12px',
                color: row.indent ? textMuted : 'text.primary',
                whiteSpace: 'nowrap',
                overflow: 'hidden'
              }}
            >
              {lane.bitmap && !row.indent && (
                <LaneToggle
                  laneKey={lane.key}
                  testId={`trend-lane-toggle-${lane.type}-${lane.address}`}
                  expanded={expanded}
                  onToggle={toggle}
                />
              )}
              {row.label}
            </Box>
            <Box
              component="svg"
              width={plot.width}
              height={BAR_HEIGHT}
              sx={{
                position: 'absolute',
                top: BAR_TOP,
                left: plot.left,
                display: 'block',
                borderRadius: '2px',
                bgcolor: 'action.hover'
              }}
            >
              <path
                d={barPath(row.spans, from, to, plot.width)}
                fill={row.color}
                fillOpacity={0.75}
              />
            </Box>
          </Box>
        ))
      })}
    </Box>
  )
})

export default TrendLanes
