import ChevronRight from '@mui/icons-material/ChevronRight'
import ExpandMore from '@mui/icons-material/ExpandMore'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { Theme, useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { textMuted } from '@renderer/theme'
import { BitColor, LogPoint, RegisterMapValue, RegisterType } from '@shared'
import { useCallback, useState } from 'react'
import { bitOn, bitsOf, LaneSpan, laneSpans } from './trendData'
import { TrendStretch, useTrendPanelZustand } from './trendPanel.zustand'
import TrendPlot, { AXIS_SIZE, PlotBox, TrendCursor, TrendLine } from './TrendPlot'

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

interface TrendLanesProps {
  lanes: TrendLane[]
  runEnds: number[]
  /** Where an open stretch ends: now while the log runs, else where it stopped. */
  end: number
  from: number
  to: number
  /** The log's oldest sample, which a zoom over the lanes starts from. */
  oldest: number | undefined
  /** The trend's cursor group, which the plot under the lanes joins. */
  syncKey: string
  onZoom: (from: number, to: number) => void
  selection: TrendStretch | undefined
  onSelect: (selection: TrendStretch | undefined) => void
  onZoomOut: () => void
  onCursor: (cursor: TrendCursor | undefined) => void
}

const NO_LINES: TrendLine[] = []
const NO_DATA: never[] = []

/** A lane's row: a name over a bar that is lit where the bit was on. */
export interface LaneRow {
  key: string
  label: string
  color: string
  spans: LaneSpan[]
  indent: boolean
}

/** The colours a lane's rows take from the theme: a bitmap's word, and its bits. */
export const laneColors = (
  theme: Theme
): { word: string; bit: (color: BitColor | undefined, fallback: string) => string } => ({
  word: theme.palette.text.secondary,
  bit: (color, fallback) =>
    color === 'error'
      ? theme.palette.error.main
      : color === 'warning'
        ? theme.palette.warning.main
        : fallback
})

/** A lane's height: its name, and the bar under it. */
export const LANE_HEIGHT = 22
/** A name's line, which the bar sits under. */
export const LABEL_HEIGHT = 12
export const BAR_TOP = 12
export const BAR_HEIGHT = 8

/**
 * A lane's rows: the register's own, lit where it was on or, for a bitmap,
 * where any bit was set, in `word` colour; and opened, a row a bit, for every
 * bit its settings name and every bit that was set, lit as its settings say
 * and coloured by `bitColor`.
 */
export const laneRows = (
  lane: TrendLane,
  expanded: boolean,
  runEnds: number[],
  end: number,
  colors: { word: string; bit: (color: BitColor | undefined, fallback: string) => string }
): LaneRow[] => [
  {
    key: lane.key,
    label: lane.label,
    color: lane.bitmap ? colors.word : lane.color,
    spans: laneSpans(lane.points, runEnds, (value) => value !== 0, end),
    indent: false
  },
  ...(expanded
    ? bitsOf(lane.mapValue?.bitMap, lane.points).map((bit): LaneRow => {
        const settings = lane.mapValue?.bitMap?.[String(bit)]
        return {
          key: `${lane.key}|${bit}`,
          label: settings?.comment ? `bit ${bit} · ${settings.comment}` : `bit ${bit}`,
          color: colors.bit(settings?.color, lane.color),
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
        sx={{ p: 0, height: LABEL_HEIGHT, flexShrink: 0, pointerEvents: 'auto' }}
      >
        {expanded ? <ExpandMore sx={{ fontSize: 14 }} /> : <ChevronRight sx={{ fontSize: 14 }} />}
      </IconButton>
    )
  }
)

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
 * The bits and bitmaps of the trend as lanes under its plots, on their time
 * axis. A bit's lane is lit where it was on; a bitmap's where any bit was
 * set, and it opens into a lane a bit, for every bit its settings name and
 * every bit that was set, lit as its settings say: inverted, a bit is on
 * while clear, and a warning or error bit takes that colour. A plot of no
 * lines lies under them, so the cursor, a drag and the wheel do over the
 * lanes what they do over a plot; the lanes let the pointer through to it,
 * all but a bitmap's toggle.
 */
const TrendLanes = meme(
  ({
    lanes,
    runEnds,
    end,
    from,
    to,
    oldest,
    syncKey,
    onZoom,
    selection,
    onSelect,
    onZoomOut,
    onCursor
  }: TrendLanesProps): JSX.Element => {
    const theme = useTheme()
    const open = useTrendPanelZustand((z) => z.openLanes)
    const toggle = useTrendPanelZustand.getState().toggleLane
    // The bars are as wide as the plot area under them, once it is laid out.
    const [plot, setPlot] = useState<PlotBox>({ left: AXIS_SIZE, width: 0 })

    return (
      <Box
        data-testid="trend-lanes"
        sx={{ position: 'relative', display: 'flex', flexDirection: 'column', flexShrink: 0 }}
      >
        <TrendPlot
          syncKey={syncKey}
          lines={NO_LINES}
          data={NO_DATA}
          unit={undefined}
          range={undefined}
          drawAs="lines"
          from={from}
          to={to}
          oldest={oldest}
          gaps={NO_DATA}
          onZoom={onZoom}
          selection={selection}
          onSelect={onSelect}
          onZoomOut={onZoomOut}
          onCursor={onCursor}
          onPlot={setPlot}
        />
        {lanes.map((lane) => {
          const expanded = lane.bitmap && open.includes(lane.key)
          const rows = laneRows(lane, expanded, runEnds, end, laneColors(theme))
          return rows.map((row) => (
            <Box
              key={row.key}
              data-testid={`trend-lane-${row.key}`}
              sx={{
                position: 'relative',
                height: LANE_HEIGHT,
                flexShrink: 0,
                pointerEvents: 'none'
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: -1,
                  // Every name starts at the plot's edge, a bit's under its
                  // bitmap's indented, and a bitmap's toggle follows its name.
                  left: row.indent ? plot.left + 16 : plot.left,
                  right: 0,
                  height: LABEL_HEIGHT,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  fontSize: 10.5,
                  lineHeight: `${LABEL_HEIGHT}px`,
                  color: row.indent ? textMuted : 'text.primary',
                  whiteSpace: 'nowrap'
                }}
              >
                {/* A long name gives way to the toggle after it. */}
                <Box
                  component="span"
                  sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
                >
                  {row.label}
                </Box>
                {lane.bitmap && !row.indent && (
                  <LaneToggle
                    laneKey={lane.key}
                    testId={`trend-lane-toggle-${lane.type}-${lane.address}`}
                    expanded={expanded}
                    onToggle={toggle}
                  />
                )}
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
  }
)

export default TrendLanes
