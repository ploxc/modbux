import Close from '@mui/icons-material/Close'
import DragIndicator from '@mui/icons-material/DragIndicator'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { applyConversion } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import DraggablePanel from '@renderer/components/shared/DraggablePanel/DraggablePanel'
import { DRAG_HANDLE_CLASS } from '@renderer/components/shared/DraggablePopover/DraggablePopover'
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
import PictureInPicture from '@mui/icons-material/PictureInPicture'
import HorizontalSplit from '@mui/icons-material/HorizontalSplit'
import Pause from '@mui/icons-material/Pause'
import TrendChart, { ReadoutRow, TrendLine } from './TrendChart'
import TrendConfigMenu from './TrendConfigMenu'
import TrendLanes, { PlotBox, TrendLane } from './TrendLanes'
import TrendNavigator from './TrendNavigator'
import TrendPicker from './TrendPicker'
import TrendSettingsPopover, { SettingsLine } from './TrendSettingsPopover'
import {
  TREND_RANGES,
  TREND_SPANS,
  TREND_STEPS,
  trendGaps,
  trendSeries,
  laneAt,
  isFollow,
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

const PAPER_SX = {
  p: 0,
  width: 640,
  height: 340,
  minWidth: 420,
  minHeight: 240,
  // The docked trend's surface, rather than the lighter one of Paper's elevation.
  bgcolor: 'background.paper',
  backgroundImage: 'none',
  resize: 'both',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
} as const

const NO_UNITS: ClientUnit[] = []

/** How tall the chart is when the trend draws lanes only: its time axis and a margin. */
const LANES_ONLY_CHART = 56

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

/** The trend's other two places: floating, docked under Monitor's grid, or filling its room. */
const ModeButtons = meme(
  ({ mode }: { mode: TrendMode }): JSX.Element => (
    <>
      {mode !== 'float' && (
        <ModeButton
          mode="float"
          label="Float over Monitor"
          icon={<PictureInPicture fontSize="small" />}
        />
      )}
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

/**
 * The range buttons, and a press that picks one. Zoomed, panned, or following
 * the log over a stretch of its own length, the trend shows no range, so none
 * is pressed, and any of them follows the log over the range again. Paused
 * over the range, the range stays pressed, and a press on it follows the log.
 */
const RangePicker = meme((): JSX.Element => {
  const range = useTrendPanelZustand((z) =>
    z.view === undefined || (!isFollow(z.view) && z.view.ofRange === true) ? z.range : null
  )
  const handleRange = useCallback(
    (_event: MouseEvent<HTMLElement>, picked: TrendRangeId | null) => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      // The range pressed already, which is null to an exclusive group.
      if (picked === null) trendPanelZustand.setView(undefined)
      else trendPanelZustand.setRange(picked)
    },
    []
  )
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={range}
      onChange={handleRange}
      aria-label="Range"
      sx={TOGGLE_GROUP_SX}
    >
      {TREND_RANGES.map(({ id, label }) => (
        <ToggleButton key={id} value={id} data-testid={`trend-range-${id}`}>
          {label}
        </ToggleButton>
      ))}
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

/**
 * Each line's colour and scale. A line set to a side is drawn on that side's
 * scale. Otherwise lines of one engineering unit share a side: the first
 * unit's is the left, the second's the right, and a line of any unit after
 * that is scaled on its own, with no axis.
 */
const layoutOf = (
  entries: DrawnEntry[],
  units: ClientUnit[]
): {
  lines: TrendLine[]
  settingsLines: SettingsLine[]
  leftScale: string | undefined
  rightScale: string | undefined
} => {
  const engineeringUnits: string[] = []
  const settingsLines = entries.map((entry): SettingsLine => {
    const mapValue = mapValueOf(units, entry)
    const engineeringUnit = mapValue?.unit ?? ''
    if (!engineeringUnits.includes(engineeringUnit)) engineeringUnits.push(engineeringUnit)
    const rank = engineeringUnits.indexOf(engineeringUnit)
    const side = entry.side ?? (rank === 0 ? 'left' : rank === 1 ? 'right' : undefined)
    const addressBase = units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
    const address = entry.address + Number(addressBase)
    return {
      key: trendKey(entry),
      side: entry.side,
      testId: `trend-line-${entry.type}-${address}`,
      line: {
        color: entry.color,
        scale: side ?? `line:${trendKey(entry)}`,
        label: mapValue?.comment ? `${address} ${mapValue.comment}` : String(address),
        unit: engineeringUnit
      }
    }
  })
  const lines = settingsLines.map(({ line }) => line)
  return {
    lines,
    settingsLines,
    leftScale: lines.some(({ scale }) => scale === 'left') ? 'left' : undefined,
    rightScale: lines.some(({ scale }) => scale === 'right') ? 'right' : undefined
  }
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
        whiteSpace: 'nowrap'
      }}
    >
      <Box
        component="span"
        sx={{ width: 10, height: 3, borderRadius: '2px', bgcolor: entry.color }}
      />
      <Box component="span" sx={{ fontFamily: 'monospace' }}>
        {address}
      </Box>
      {comment}
      <IconButton
        size="small"
        aria-label={`Take ${address} out of the trend`}
        data-testid={`trend-chip-remove-${entry.type}-${address}`}
        onClick={handleRemove}
        sx={{ p: 0.25 }}
      >
        <Close sx={{ fontSize: 14 }} />
      </IconButton>
    </Box>
  )
})

/**
 * The registers a Log icon in Monitor added, as lines over the range picked
 * of the log, converted as the grid converts them, in a panel that drags by
 * its title, resizes from its corner, and leaves Monitor working under it. It
 * moves while the log runs, and otherwise shows the range up to where the log
 * last stopped. The range before the log's oldest sample is hatched, and each
 * stretch between two runs is shaded and named by why the first ended.
 */
const TrendContent = meme(
  ({ placement, anchor }: { placement: 'float' | 'inline'; anchor: HTMLElement }): JSX.Element => {
    const entries = useTrendPanelZustand((z) => z.entries)
    const mode = useTrendPanelZustand((z) => z.mode)
    const uuid = useTrendPanelZustand((z) => z.uuid)
    const units = useClientZustand((z) => z.clients[uuid]?.units ?? NO_UNITS)
    const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
    const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
    // The array main's last client state carried, which the store keeps as it came.
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
    const lineEntries = useMemo(
      () => entries.filter((entry) => !isLane(entry, mapValueOf(units, entry))),
      [entries, units]
    )
    const layout = useMemo(() => layoutOf(lineEntries, units), [lineEntries, units])
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

    // Live, the range ends now, and moves with each answer; stopped, where the
    // log stopped. The whole log starts at its oldest sample, and an empty one
    // shows the shortest range.
    const end = running ? Date.now() : (lastEnd ?? Date.now())
    const to = held?.to ?? end
    const from =
      held?.from ?? (Number.isFinite(span) ? to - span : (oldest ?? to - TREND_SPANS['10m']))
    const gaps = trendGaps(runs, end)
    const handleClose = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.close()
    }, [])
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

    const floating = placement === 'float'
    const content = (
      <Box
        data-testid="trend-panel"
        data-mode={mode}
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', fontSize: 12.5 }}
      >
        <Box
          className={floating ? DRAG_HANDLE_CLASS : undefined}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: floating ? 0.75 : 1.5,
            pr: 1,
            pt: 0.75,
            userSelect: 'none',
            cursor: floating ? 'move' : 'default'
          }}
        >
          {floating && <DragIndicator sx={{ fontSize: 16, color: 'text.disabled' }} />}
          <TrendConfigMenu />
          <RangePicker />
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
          {view !== undefined && (isFollow(view) || view.ofRange !== true) && (
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
                : `${formatTime(view.from)} to ${formatTime(view.to)}`}
            </Box>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <TrendSettingsPopover lines={layout.settingsLines} />
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
        {/* With no lines to draw, the chart is its time axis and the lanes take the room. */}
        <Box
          sx={[
            { minHeight: 0, display: 'flex', px: 1, pb: 1 },
            lineEntries.length > 0 ? { flexGrow: 1 } : { height: LANES_ONLY_CHART, flexShrink: 0 }
          ]}
        >
          <TrendChart
            lines={layout.lines}
            data={drawn.map(({ series }) => series)}
            leftScale={layout.leftScale}
            rightScale={layout.rightScale}
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
          // Beside lines the lanes scroll past a share of the panel, so the chart
          // keeps its room; with no lines they take it.
          <Box
            sx={[
              { px: 1, pb: 0.5, overflowY: 'auto' },
              lineEntries.length > 0 ? { flexShrink: 0, maxHeight: '40%' } : { flexGrow: 1 }
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
      </Box>
    )
    if (!floating)
      return (
        <Box
          sx={{ height: '100%', bgcolor: 'background.paper', borderTop: 1, borderColor: 'divider' }}
        >
          {content}
        </Box>
      )
    return (
      // In the grid's top right corner, clear of the address column where the
      // Log icons that add to it are: opened under a row, it covered the rows
      // below it.
      <DraggablePanel anchor={anchor} onClose={handleClose} paperSx={PAPER_SX} label="Trend">
        {content}
      </DraggablePanel>
    )
  }
)

/**
 * The trend where Monitor draws it: floating, or inline in its grid's room.
 * Only the place the trend's mode names draws it, and the other returns
 * before it asks main for anything.
 */
const TrendPanel = meme(({ placement }: { placement: 'float' | 'inline' }): JSX.Element | null => {
  const anchor = useTrendPanelZustand((z) => z.anchor)
  const floatingMode = useTrendPanelZustand((z) => z.mode === 'float')
  if (anchor === null || floatingMode !== (placement === 'float')) return null
  return <TrendContent placement={placement} anchor={anchor} />
})

export default TrendPanel
