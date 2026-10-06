import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { applyConversion } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useScriptEngineZustand } from '@renderer/conversion/scriptEngine.zustand'
import { textMuted } from '@renderer/theme'
import {
  ClientUnit,
  isBooleanRegister,
  isNumberRegister,
  LogPoint,
  RegisterMapValue,
  TrendRangeId
} from '@shared'
import { formatDuration, formatTime } from '@renderer/components/client/Logging/format'
import { MouseEvent, ReactNode, useCallback, useMemo, useState } from 'react'
import OpenInFull from '@mui/icons-material/OpenInFull'
import HorizontalSplit from '@mui/icons-material/HorizontalSplit'
import Pause from '@mui/icons-material/Pause'
import TrendChart, { ReadoutRow, TrendLine } from './TrendChart'
import TrendConfigMenu from './TrendConfigMenu'
import TrendLanes, { LANE_HEIGHT, PlotBox, TrendLane } from './TrendLanes'
import TrendNavigator from './TrendNavigator'
import TrendPicker from './TrendPicker'
import TrendSettingsPanel, { SettingsLine } from './TrendSettingsPanel'
import TrendStretchPicker from './TrendStretchPicker'
import {
  TREND_RANGES,
  TREND_SPANS,
  TREND_STEPS,
  trendGaps,
  trendSeries,
  laneAt,
  isFollow,
  axisScale,
  TrendAxis,
  trendAxes,
  stretchLabel,
  shownStretch,
  TrendFollow,
  TrendView,
  viewWithin
} from './trendData'
import {
  DrawnEntry,
  TrendEntry,
  trendKey,
  TrendMode,
  useTrendPanelZustand
} from './trendPanel.zustand'
import { useLogWindows } from './useLogWindows'

const NO_UNITS: ClientUnit[] = []

/** How tall the chart is when the trend draws lanes only: its time axis and a margin. */
const LANES_ONLY_CHART = 56

/** How short the chart gets while it draws lines. */
const CHART_MIN_HEIGHT = 120

/** How many stretches the navigator's line of the whole log is asked in. */
const NAVIGATOR_STEPS = 300

/** A press that puts the trend in `mode`. */
const ModeButton = meme(
  ({ mode, label, icon }: { mode: TrendMode; label: string; icon: ReactNode }): JSX.Element => {
    const handleClick = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setMode(mode)
    }, [mode])
    return (
      <IconButton
        size="small"
        aria-label={label}
        title={label}
        data-testid={`trend-mode-${mode}-btn`}
        onClick={handleClick}
      >
        {icon}
      </IconButton>
    )
  }
)

/** The trend's other place: docked under Monitor's grid, or filling its room. */
const ModeButtons = meme(
  ({ mode }: { mode: TrendMode }): JSX.Element => (
    <>
      {mode !== 'dock' && (
        <ModeButton
          mode="dock"
          label="Dock under Monitor"
          icon={<HorizontalSplit fontSize="small" />}
        />
      )}
      {mode !== 'fill' && (
        <ModeButton mode="fill" label="Fill the view" icon={<OpenInFull fontSize="small" />} />
      )}
    </>
  )
)

/** A group of the header, each one row of one height, so the first row's groups and the icons line up. */
const HEADER_ROW_SX = { display: 'flex', alignItems: 'center', gap: 1, height: 30 } as const

/** The header's toggle groups: the range, and live or paused. */
const TOGGLE_GROUP_SX = {
  flexShrink: 0,
  '& .MuiToggleButton-root': {
    py: 0.125,
    px: 1,
    gap: 0.625,
    fontSize: 11.5,
    textTransform: 'none',
    whiteSpace: 'nowrap'
  }
} as const

/** The range group's value: a range, the calendar, or none while zoomed or panned. */
const pressedOf = (
  view: TrendView | TrendFollow | undefined,
  range: TrendRangeId
): TrendRangeId | 'calendar' | null => {
  if (view === undefined) return range
  if (isFollow(view) || view.pressed === undefined) return null
  return view.pressed === 'range' ? range : 'calendar'
}

/**
 * The range buttons, and a press that picks one. Zoomed, panned, or following
 * the log over a stretch of its own length, the trend shows no range, so none
 * is pressed, and any of them follows the log over the range again. Paused
 * over the range, the range stays pressed, and a press on it follows the log.
 * The calendar at the end picks a stretch of its own.
 */
const RangePicker = meme((): JSX.Element => {
  const pressed = useTrendPanelZustand((z) => pressedOf(z.view, z.range))
  const handleRange = useCallback(
    (_event: MouseEvent<HTMLElement>, next: TrendRangeId | 'calendar' | null) => {
      if (next === 'calendar') return
      const trendPanelZustand = useTrendPanelZustand.getState()
      // The range pressed already, which is null to an exclusive group.
      if (next === null) trendPanelZustand.setView(undefined)
      else trendPanelZustand.setRange(next)
    },
    []
  )
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={pressed}
      onChange={handleRange}
      aria-label="Range"
      sx={TOGGLE_GROUP_SX}
    >
      {TREND_RANGES.map(({ id, label }) => (
        <ToggleButton key={id} value={id} data-testid={`trend-range-${id}`}>
          {label}
        </ToggleButton>
      ))}
      <TrendStretchPicker />
    </ToggleButtonGroup>
  )
})

/**
 * Whether the trend follows the log or holds still, and a press that picks
 * one. A zoom or a pan holds it still too; Live follows the log over the range.
 */
const LiveOrPaused = meme((): JSX.Element => {
  const paused = useTrendPanelZustand((z) => z.view !== undefined && !isFollow(z.view))
  const handleChange = useCallback(
    (_event: MouseEvent<HTMLElement>, picked: 'live' | 'paused' | null) => {
      if (picked === null) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      if (picked === 'live') {
        trendPanelZustand.setView(undefined)
        return
      }
      const { oldest } = dataOf(useLiveZustand.getState(), trendPanelZustand.uuid).clientState.log
      trendPanelZustand.pause(Date.now(), oldest)
    },
    []
  )
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={paused ? 'paused' : 'live'}
      onChange={handleChange}
      aria-label="Live or paused"
      sx={TOGGLE_GROUP_SX}
    >
      <ToggleButton
        value="live"
        data-testid="trend-live-btn"
        sx={{ '&.Mui-selected': { color: 'success.light' } }}
      >
        <Box
          component="span"
          sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }}
        />
        Live
      </ToggleButton>
      <ToggleButton value="paused" data-testid="trend-paused-btn">
        <Pause sx={{ fontSize: 12 }} />
        Paused
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

/** Whether a register is drawn as a lane under the lines: a bit, or a bitmap's word. */
const isLane = (entry: TrendEntry, mapValue: RegisterMapValue | undefined): boolean =>
  isBooleanRegister(entry.type) || mapValue?.dataType === 'bitmap'

/** A lane's sample as the readout writes it: on or off, or the word in hex. */
const laneText = (bitmap: boolean, point: LogPoint | undefined): string => {
  if (point === undefined || point.error !== undefined) return '–'
  if (bitmap) return `0x${point.value.toString(16).padStart(4, '0')}`
  return point.value === 0 ? 'off' : 'on'
}

/** The mapping entry of the register a trend line draws. */
const mapValueOf = (units: ClientUnit[], entry: TrendEntry): RegisterMapValue | undefined =>
  units.find(({ uuid }) => uuid === entry.unit)?.registerMapping[entry.type][entry.address]

/** Each line's colour, its engineering unit's scale and how it is named, and an axis per unit. */
const layoutOf = (
  entries: DrawnEntry[],
  units: ClientUnit[]
): { lines: TrendLine[]; settingsLines: SettingsLine[]; axes: TrendAxis[] } => {
  const settingsLines = entries.map((entry): SettingsLine => {
    const mapValue = mapValueOf(units, entry)
    const engineeringUnit = mapValue?.unit ?? ''
    const addressBase = units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
    const address = entry.address + Number(addressBase)
    return {
      key: trendKey(entry),
      testId: `trend-line-${entry.type}-${address}`,
      line: {
        color: entry.color,
        scale: axisScale(engineeringUnit),
        label: mapValue?.comment ? `${address} ${mapValue.comment}` : String(address),
        unit: engineeringUnit
      }
    }
  })
  const lines = settingsLines.map(({ line }) => line)
  return { lines, settingsLines, axes: trendAxes(lines) }
}

/** One register of the trend: its colour, address and name, and a press that takes it out. */
const TrendChip = meme(({ entry }: { entry: DrawnEntry }): JSX.Element => {
  const addressBase = useClientZustand(
    (z) => z.clients[entry.uuid]?.units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
  )
  const comment = useClientZustand(
    (z) => mapValueOf(z.clients[entry.uuid]?.units ?? NO_UNITS, entry)?.comment
  )
  const handleRemove = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.remove(trendKey(entry))
  }, [entry])
  const address = entry.address + Number(addressBase)

  return (
    <Box
      component="span"
      data-testid={`trend-chip-${entry.type}-${address}`}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        height: 24,
        pl: 1,
        pr: 0.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: '12px',
        fontSize: 12,
        whiteSpace: 'nowrap',
        // A long name ends in an ellipsis inside the panel, and the chip's title gives it whole.
        maxWidth: '100%',
        minWidth: 0
      }}
      title={comment}
    >
      <Box
        component="span"
        sx={{ flexShrink: 0, width: 10, height: 3, borderRadius: '2px', bgcolor: entry.color }}
      />
      <Box component="span" sx={{ flexShrink: 0, fontFamily: 'monospace' }}>
        {address}
      </Box>
      {comment && (
        <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {comment}
        </Box>
      )}
      <IconButton
        size="small"
        aria-label={`Take ${address} out of the trend`}
        data-testid={`trend-chip-remove-${entry.type}-${address}`}
        onClick={handleRemove}
        sx={{ flexShrink: 0, p: 0.25 }}
      >
        <Close sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  )
})

/**
 * Whether the trend follows the log, holds still or has nothing to follow,
 * and the stretch it holds when that is not the range.
 */
const TrendStatus = meme(({ uuid }: { uuid: string }): JSX.Element => {
  const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
  const view = useTrendPanelZustand((z) => z.view)
  return (
    <>
      {running ? (
        <LiveOrPaused />
      ) : (
        <Box
          component="span"
          data-testid="trend-logging-off"
          sx={{ flexShrink: 0, fontSize: 11.5, color: textMuted }}
        >
          logging is off
        </Box>
      )}
      {view !== undefined && (isFollow(view) || view.pressed !== 'range') && (
        <Box
          component="span"
          data-testid={isFollow(view) ? 'trend-follow' : 'trend-view'}
          sx={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: textMuted,
            fontFamily: 'monospace',
            fontSize: 11.5
          }}
        >
          {isFollow(view)
            ? `the last ${formatDuration(view.length)}`
            : view.pressed === 'calendar'
              ? stretchLabel(view.from, view.to)
              : `${formatTime(view.from)} to ${formatTime(view.to)}`}
        </Box>
      )}
    </>
  )
})

interface TrendBodyProps {
  uuid: string
  entries: DrawnEntry[]
  units: ClientUnit[]
  /** The entries drawn as lines, and how they are drawn; the rest are lanes. */
  lineEntries: DrawnEntry[]
  layout: { lines: TrendLine[]; axes: TrendAxis[] }
}

/**
 * What the trend draws of the log: the chart, the lanes under it and the
 * navigator over the whole log. It asks main for its windows and renders on
 * each answer, and the header above it is a sibling that does not.
 */
const TrendBody = meme(
  ({ uuid, entries, units, lineEntries, layout }: TrendBodyProps): JSX.Element => {
    const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
    const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
    // Kept by the live store while it is the same, though main builds it anew in every state.
    const runs = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs)
    const range = useTrendPanelZustand((z) => z.range)
    const view = useTrendPanelZustand((z) => z.view)
    const held = view === undefined || isFollow(view) ? undefined : view
    const settings = useTrendPanelZustand((z) => z.settings)
    // A script's value waits for the engine, and draws again once it is there.
    useScriptEngineZustand((z) => z.ready)

    const lastEnd = runs.at(-1)?.end
    const rangeSpan = TREND_SPANS[range]
    const span = view !== undefined && isFollow(view) ? view.length : rangeSpan
    const started = oldest !== undefined
    // Zoomed or panned, the trend holds still on its stretch, in steps of it,
    // and asks as much again on either side so its lines run to its edges.
    const points = useLogWindows(
      entries,
      held === undefined
        ? { live: running, span, until: lastEnd, started }
        : {
            live: false,
            span: 3 * (held.to - held.from),
            until: held.to + (held.to - held.from),
            started,
            steps: 3 * TREND_STEPS
          }
    )
    const first = useMemo(() => entries.slice(0, 1), [entries])
    const whole = useLogWindows(first, {
      live: running,
      span: Number.POSITIVE_INFINITY,
      until: lastEnd,
      started,
      steps: NAVIGATOR_STEPS
    })
    const [plot, setPlot] = useState<PlotBox>()

    // Converted again on every render, which comes with each answer, a store
    // change or the script engine turning ready.
    const runEnds = runs.flatMap(({ end }) => (end === undefined ? [] : [end]))
    const drawn = lineEntries.map((entry) => {
      const mapValue = mapValueOf(units, entry)
      const convert = (raw: number): number | undefined => {
        if (!isNumberRegister(entry.type)) return raw
        const converted = applyConversion(String(raw), mapValue?.dataType, mapValue?.conversion)
        return typeof converted === 'number' ? converted : undefined
      }
      return { entry, series: trendSeries(points[trendKey(entry)] ?? [], runEnds, convert) }
    })

    const { from, to, end } = shownStretch(view, range, { running, oldest, lastEnd }, Date.now())
    const gaps = trendGaps(runs, end)
    // Inside what the log holds, up to now; reaching its end follows the log
    // again, over the range or over a shorter stretch's own length.
    // The end is this render's, which the chart and the navigator drew with, so
    // a stretch dragged back to their end reaches the log's.
    const handleZoom = useCallback(
      (zoomFrom: number, zoomTo: number) => {
        const trendPanelZustand = useTrendPanelZustand.getState()
        trendPanelZustand.setView(
          viewWithin(zoomFrom, zoomTo, { from: oldest ?? zoomFrom, to: end }, rangeSpan, running)
        )
      },
      [end, oldest, rangeSpan, running]
    )
    const handleFollow = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setView(undefined)
    }, [])
    const lanes = entries.flatMap((entry): TrendLane[] => {
      const mapValue = mapValueOf(units, entry)
      if (!isLane(entry, mapValue)) return []
      const addressBase = units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
      const address = entry.address + Number(addressBase)
      return [
        {
          key: trendKey(entry),
          type: entry.type,
          address,
          label: mapValue?.comment ? `${address} ${mapValue.comment}` : String(address),
          color: entry.color,
          bitmap: mapValue?.dataType === 'bitmap',
          mapValue,
          points: points[trendKey(entry)] ?? []
        }
      ]
    })
    const readoutRows = (time: number): ReadoutRow[] =>
      lanes.map((lane) => ({
        key: lane.key,
        label: lane.label,
        color: lane.bitmap ? 'text.secondary' : lane.color,
        text: laneText(lane.bitmap, laneAt(lane.points, runEnds, time))
      }))
    const firstEntry = first[0]

    return (
      <>
        {/* With no lines to draw, the chart is its time axis and the lanes take the room. */}
        <Box
          sx={[
            { minHeight: 0, display: 'flex', px: 1, pb: 1 },
            lineEntries.length > 0
              ? { flexGrow: 1, minHeight: CHART_MIN_HEIGHT }
              : { height: LANES_ONLY_CHART, flexShrink: 0 }
          ]}
        >
          <TrendChart
            lines={layout.lines}
            data={drawn.map(({ series }) => series)}
            axes={layout.axes}
            from={from}
            to={to}
            oldest={oldest}
            gaps={gaps}
            onZoom={handleZoom}
            onZoomOut={handleFollow}
            onPlot={setPlot}
            readoutRows={readoutRows}
            settings={settings}
            origin={oldest ?? from}
          />
        </Box>
        {lanes.length > 0 && plot !== undefined && (
          // Beside lines the lanes scroll past 40% of the panel, and give way
          // down to one lane before the chart goes under its minimum; with no
          // lines they take the room.
          <Box
            sx={[
              { px: 1, pb: 0.5, overflowY: 'auto' },
              lineEntries.length > 0
                ? {
                    maxHeight: '40%',
                    // The padding is inside the box's height.
                    minHeight: (theme) => `calc(${LANE_HEIGHT}px + ${theme.spacing(0.5)})`
                  }
                : { flexGrow: 1 }
            ]}
          >
            <TrendLanes lanes={lanes} runEnds={runEnds} end={end} from={from} to={to} plot={plot} />
          </Box>
        )}
        {oldest !== undefined && firstEntry !== undefined && (
          <Box sx={{ px: 1.75, pb: 1 }}>
            <TrendNavigator
              start={oldest}
              end={end}
              from={from}
              to={to}
              points={whole[trendKey(firstEntry)] ?? []}
              color={firstEntry.color}
              onPan={handleZoom}
            />
          </Box>
        )}
      </>
    )
  }
)

/**
 * The registers a Log icon in Monitor added, as lines over the range picked
 * of the log, converted as the grid converts them, docked under Monitor's
 * grid or filling its room. It moves while the log runs, and otherwise shows the range up to where the log
 * last stopped. The range before the log's oldest sample is hatched, and each
 * stretch between two runs is shaded and named by why the first ended.
 */
const TrendContent = meme((): JSX.Element => {
  const entries = useTrendPanelZustand((z) => z.entries)
  const mode = useTrendPanelZustand((z) => z.mode)
  const uuid = useTrendPanelZustand((z) => z.uuid)
  const units = useClientZustand((z) => z.clients[uuid]?.units ?? NO_UNITS)
  const lineEntries = useMemo(
    () => entries.filter((entry) => !isLane(entry, mapValueOf(units, entry))),
    [entries, units]
  )
  const layout = useMemo(() => layoutOf(lineEntries, units), [lineEntries, units])
  const handleClose = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.close()
  }, [])

  return (
    <Box sx={{ height: '100%', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}>
      <Box
        data-testid="trend-panel"
        data-mode={mode}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', fontSize: 12.5 }}
      >
        {/*
         * Too narrow for one row, what the trend shows wraps under its name and
         * ranges, and the icons keep their place at the right of the first row.
         */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1,
            pl: 1.5,
            pr: 1,
            pt: 0.75,
            userSelect: 'none'
          }}
        >
          <Box
            sx={{
              flex: '1 1 auto',
              minWidth: 0,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              columnGap: 1,
              rowGap: 0.5
            }}
          >
            <Box sx={[HEADER_ROW_SX, { minWidth: 0 }]}>
              <TrendConfigMenu />
            </Box>
            <Box sx={HEADER_ROW_SX}>
              <RangePicker />
            </Box>
            <Box sx={[HEADER_ROW_SX, { minWidth: 0 }]}>
              <TrendStatus uuid={uuid} />
            </Box>
          </Box>
          <Box sx={[HEADER_ROW_SX, { flexShrink: 0 }]}>
            <TrendSettingsPanel lines={layout.settingsLines} axes={layout.axes} />
            <ModeButtons mode={mode} />
            <IconButton
              size="small"
              aria-label="Close the trend"
              data-testid="trend-close-btn"
              onClick={handleClose}
            >
              <Close fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0.75, px: 1.75 }}>
          {entries.map((entry) => (
            <TrendChip key={trendKey(entry)} entry={entry} />
          ))}
          <TrendPicker />
          {entries.length === 0 && (
            <Box component="span" data-testid="trend-empty" sx={{ fontSize: 12, color: textMuted }}>
              Add a register, or press a Log icon in Monitor.
            </Box>
          )}
        </Box>
        <TrendBody
          uuid={uuid}
          entries={entries}
          units={units}
          lineEntries={lineEntries}
          layout={layout}
        />
      </Box>
    </Box>
  )
})

/** The trend in Monitor's grid room, while it is open; closed, it asks main for nothing. */
const TrendPanel = meme((): JSX.Element | null => {
  const open = useTrendPanelZustand((z) => z.anchor !== null)
  if (!open) return null
  return <TrendContent />
})

export default TrendPanel
