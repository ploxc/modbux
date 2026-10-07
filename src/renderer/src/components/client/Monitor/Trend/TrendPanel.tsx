import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useScriptEngineZustand } from '@renderer/conversion/scriptEngine.zustand'
import { textMuted } from '@renderer/theme'
import { AxisRange, ClientUnit, TrendRangeId } from '@shared'
import { formatDuration, formatTime } from '@renderer/components/client/Logging/format'
import {
  Fragment,
  KeyboardEvent,
  MouseEvent,
  PointerEvent,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from 'react'
import OpenInFull from '@mui/icons-material/OpenInFull'
import HorizontalSplit from '@mui/icons-material/HorizontalSplit'
import Pause from '@mui/icons-material/Pause'
import HelpOutline from '@mui/icons-material/HelpOutlineOutlined'
import Undo from '@mui/icons-material/Undo'
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import Tooltip from '@mui/material/Tooltip'
import { alpha, useTheme } from '@mui/material/styles'
import { DateTime } from 'luxon'
import type uPlot from 'uplot'
import PlotGrip from './PlotGrip'
import TrendConfigMenu from './TrendConfigMenu'
import TrendLanes, { laneColors, laneRows, TrendLane } from './TrendLanes'
import { trendImage } from './trendImage'
import TrendNavigator from './TrendNavigator'
import TrendPlot, { TrendLine } from './TrendPlot'
import TrendReadout from './TrendReadout'
import { useTrendReadoutZustand } from './trendReadout.zustand'
import { convertOf, isLane, mapValueOf } from './trendRegister'
import { exportTrendCsv } from './exportTrendCsv'
import TrendSelectionPanel, { SelectionRegister } from './TrendSelectionPanel'
import TrendTimeAxis from './TrendTimeAxis'
import TrendPicker from './TrendPicker'
import TrendSettingsPanel, { SettingsLine } from './TrendSettingsPanel'
import TrendStretchPicker from './TrendStretchPicker'
import {
  TREND_RANGES,
  TREND_SPANS,
  TREND_STEPS,
  trendGaps,
  trendSeries,
  isFollow,
  axisScale,
  TrendAxis,
  trendAxes,
  stretchLabel,
  shownStretch,
  TrendFollow,
  TrendView,
  viewWithin,
  plotsOf,
  plotShare,
  selectionLabel,
  panBy,
  zoomAround,
  WHEEL_ZOOM,
  KEY_PAN,
  navigatorEntry,
  scaleRange
} from './trendData'
import { DrawnEntry, trendKey, TrendMode, useTrendPanelZustand } from './trendPanel.zustand'
import { useLogWindows } from './useLogWindows'

const NO_UNITS: ClientUnit[] = []

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
      if (next === null) trendPanelZustand.followRange()
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
        trendPanelZustand.followRange()
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

/** The press that takes the last zoom or pan back, there while there is one, and named by where it goes. */
const BackButton = meme((): JSX.Element | null => {
  const step = useTrendPanelZustand((z) => z.history.at(-1))
  const back = useTrendPanelZustand.getState().back
  if (step === undefined) return null
  const title =
    step.view === undefined || isFollow(step.view)
      ? 'Back to the range'
      : `Back to ${selectionLabel(step.view.from, step.view.to)}`
  return (
    <IconButton
      size="small"
      aria-label={title}
      title={title}
      data-testid="trend-back-btn"
      onClick={back}
    >
      <Undo fontSize="small" />
    </IconButton>
  )
})

/** The press that hands over a CSV of what the trend shows: its stretch, of the registers shown. */
const CsvButton = meme((): JSX.Element => {
  const handleExport = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    const { log } = dataOf(useLiveZustand.getState(), trendPanelZustand.uuid).clientState
    const { from, to } = shownStretch(
      trendPanelZustand.view,
      trendPanelZustand.range,
      { running: log.running, oldest: log.oldest, lastEnd: log.runs.at(-1)?.end },
      Date.now()
    )
    void exportTrendCsv({ from, to })
  }, [])
  return (
    <IconButton
      size="small"
      aria-label="Export what the trend shows as CSV"
      title="Export what the trend shows as CSV"
      data-testid="trend-csv-btn"
      onClick={handleExport}
    >
      <FileDownloadOutlined fontSize="small" />
    </IconButton>
  )
})

/** What each gesture and key does in the trend, as the ? lists it. */
const GESTURES: readonly [string, string][] = [
  ['Drag', 'select a stretch'],
  ['Shift + drag', 'pan'],
  ['Wheel', 'scroll the plots'],
  ['Wheel sideways', 'pan'],
  ['Wheel over an axis', 'zoom that axis'],
  ['Pinch', 'zoom the time'],
  ['Backspace', 'back one zoom'],
  ['Double click', 'back to the range, live'],
  ['+ and −', 'zoom in and out'],
  ['← and →', 'pan'],
  ['Esc', 'clear the stretch, then back to live']
]

/** The ?, whose tooltip lists the gestures and keys, on hover and on focus. */
const HelpButton = meme(
  (): JSX.Element => (
    <Tooltip
      title={
        <Box
          data-testid="trend-help"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            columnGap: 1.75,
            rowGap: 0.625,
            py: 0.5,
            fontSize: 12
          }}
        >
          {GESTURES.map(([gesture, effect]) => (
            <Fragment key={gesture}>
              <Box component="span" sx={{ opacity: 0.7 }}>
                {gesture}
              </Box>
              <span>{effect}</span>
            </Fragment>
          ))}
        </Box>
      }
      slotProps={{ tooltip: { sx: { maxWidth: 360 } } }}
    >
      <IconButton
        size="small"
        aria-label="How to move through the trend"
        data-testid="trend-help-btn"
      >
        <HelpOutline fontSize="small" />
      </IconButton>
    </Tooltip>
  )
)

/** A line, as Axes and lines lists it, and the register it draws. */
interface PlotItem extends SettingsLine {
  entry: DrawnEntry
  unit: string
}

/** The lines one plot draws, of one engineering unit, and the registers they draw. */
interface LayoutPlot {
  unit: string
  lines: TrendLine[]
  items: PlotItem[]
}

/**
 * Each line's colour, its engineering unit's scale and how it is named, for
 * Axes and lines, which lists hidden lines too; and an axis and a plot per
 * unit of the lines shown.
 */
const layoutOf = (
  entries: DrawnEntry[],
  units: ClientUnit[]
): { settingsLines: SettingsLine[]; axes: TrendAxis[]; plots: LayoutPlot[] } => {
  const items = entries.map((entry): PlotItem => {
    const mapValue = mapValueOf(units, entry)
    const engineeringUnit = mapValue?.unit ?? ''
    const addressBase = units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
    const address = entry.address + Number(addressBase)
    return {
      entry,
      unit: engineeringUnit,
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
  const shown = items.filter(({ entry }) => entry.hidden !== true)
  const plots = plotsOf(shown).map(
    ({ unit, lines: plotItems }): LayoutPlot => ({
      unit,
      lines: plotItems.map(({ line }) => line),
      items: plotItems
    })
  )
  return { settingsLines: items, axes: trendAxes(shown.map(({ line }) => line)), plots }
}

/**
 * One register of the trend: its colour, address and name, which a click
 * hides and shows and a double click shows alone, and a press that takes it
 * out. The two are siblings, because a button may not hold a button. Hidden,
 * the chip stays, dashed and dim, its swatch an outline in its colour.
 */
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
  const handleToggle = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.toggleHidden(trendKey(entry))
  }, [entry])
  const handleSolo = useCallback(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.solo(trendKey(entry))
  }, [entry])
  const address = entry.address + Number(addressBase)
  const hidden = entry.hidden === true

  return (
    <Box
      component="span"
      data-testid={`trend-chip-${entry.type}-${address}`}
      data-hidden={hidden}
      sx={{
        display: 'flex',
        alignItems: 'center',
        height: 24,
        pr: 0.25,
        border: 1,
        borderStyle: hidden ? 'dashed' : 'solid',
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
      <ButtonBase
        aria-pressed={!hidden}
        aria-label={hidden ? `Show ${address}` : `Hide ${address}`}
        data-testid={`trend-chip-toggle-${entry.type}-${address}`}
        onClick={handleToggle}
        onDoubleClick={handleSolo}
        sx={{
          alignSelf: 'stretch',
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          pl: 1,
          pr: 0.5,
          borderRadius: '12px 0 0 12px',
          font: 'inherit',
          opacity: hidden ? 0.55 : 1
        }}
      >
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            width: 10,
            height: 3,
            borderRadius: '2px',
            boxSizing: 'border-box',
            ...(hidden ? { border: 1, borderColor: entry.color } : { bgcolor: entry.color })
          }}
        />
        <Box component="span" sx={{ flexShrink: 0, fontFamily: 'monospace' }}>
          {address}
        </Box>
        {comment && (
          <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {comment}
          </Box>
        )}
      </ButtonBase>
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

/** The height of the box `ref` holds, as it changes, while `mounted`; 0 while it is not. */
const useHeightOf = (ref: RefObject<HTMLElement>, mounted: boolean): number => {
  const [height, setHeight] = useState(0)
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const observer = new ResizeObserver(() => setHeight(box.offsetHeight))
    observer.observe(box)
    return (): void => {
      observer.disconnect()
      setHeight(0)
    }
  }, [ref, mounted])
  return height
}

/** A plot at its height, and the grip under it that drags that height. */
const PlotRoom = meme(
  ({
    index,
    unit,
    height,
    children
  }: {
    index: number
    unit: string
    height: number
    children: ReactNode
  }): JSX.Element => {
    const setPlotHeight = useTrendPanelZustand.getState().setPlotHeight
    return (
      <>
        <Box
          data-testid={`trend-plot-${index}`}
          data-unit={unit}
          // A grip moves the height on every move of the pointer, and a value
          // in `sx` would be a new class each time.
          style={{ height }}
          sx={{ position: 'relative', flexShrink: 0 }}
        >
          {children}
        </Box>
        <PlotGrip
          unit={unit}
          testId={`trend-plot-grip-${index}`}
          height={height}
          onHeight={setPlotHeight}
        />
      </>
    )
  }
)

interface TrendBodyProps {
  uuid: string
  entries: DrawnEntry[]
  units: ClientUnit[]
  /** A plot per engineering unit of the lines. */
  plots: LayoutPlot[]
}

/**
 * What the trend draws of the log: a plot per engineering unit, each at its
 * height, and the lanes under them, scrolling once they are taller than the
 * room; under those the time axis, and the navigator over the whole log. It
 * asks main for its windows and renders on each answer, and the header above
 * it is a sibling that does not.
 */
const TrendBody = meme(({ uuid, entries, units, plots }: TrendBodyProps): JSX.Element => {
  const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
  const oldest = useLiveZustand((z) => dataOf(z, uuid).clientState.log.oldest)
  // Kept by the live store while it is the same, though main builds it anew in every state.
  const runs = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs)
  const range = useTrendPanelZustand((z) => z.range)
  const view = useTrendPanelZustand((z) => z.view)
  const held = view === undefined || isFollow(view) ? undefined : view
  const drawAs = useTrendPanelZustand((z) => z.settings.drawAs)
  const time = useTrendPanelZustand((z) => z.settings.time)
  const axes = useTrendPanelZustand((z) => z.settings.axes)
  const heights = useTrendPanelZustand((z) => z.settings.heights)
  const axisZoom = useTrendPanelZustand((z) => z.axisZoom)
  const selection = useTrendPanelZustand((z) => z.selection)
  const setSelection = useTrendPanelZustand.getState().setSelection
  // A script's value waits for the engine, and draws again once it is there.
  const scriptReady = useScriptEngineZustand((z) => z.ready)
  const syncKey = useId()
  const setCursor = useTrendReadoutZustand.getState().setCursor
  const room = useRef<HTMLDivElement>(null)
  const scroll = useRef<HTMLDivElement>(null)
  const lanesBox = useRef<HTMLDivElement>(null)

  // Axes and lines reads the range an axis shows off the plot drawing it.
  const charts = useRef(new Map<string, uPlot>())
  const handleChart = useCallback((unit: string, chart: uPlot | null) => {
    if (chart === null) charts.current.delete(unit)
    else charts.current.set(unit, chart)
  }, [])
  useEffect(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.setShownRange((unit) =>
      scaleRange(charts.current.get(unit)?.scales[axisScale(unit)])
    )
    return (): void => trendPanelZustand.setShownRange(() => undefined)
  }, [])

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
  // The navigator draws the first register shown, or the first while all are hidden.
  const first = useMemo(() => {
    const drawn = navigatorEntry(entries)
    return drawn === undefined ? [] : [drawn]
  }, [entries])
  const whole = useLogWindows(first, {
    live: running,
    span: Number.POSITIVE_INFINITY,
    until: lastEnd,
    started,
    steps: NAVIGATOR_STEPS
  })

  const runEnds = useMemo(() => runs.flatMap(({ end }) => (end === undefined ? [] : [end])), [runs])
  // Converted again on every render, which comes with each answer, a store
  // change or the script engine turning ready.
  const drawn = plots.map((plot) => ({
    plot,
    lines: plot.items.map(({ entry, line }) => {
      return {
        key: trendKey(entry),
        line,
        series: trendSeries(
          points[trendKey(entry)] ?? [],
          runEnds,
          convertOf(entry, mapValueOf(units, entry))
        )
      }
    })
  }))

  const { from, to, end } = shownStretch(view, range, { running, oldest, lastEnd }, Date.now())
  const gaps = trendGaps(runs, end)
  // Inside what the log holds, up to now; reaching its end follows the log
  // again, over the range or over a shorter stretch's own length.
  // The end is this render's, which the plots and the navigator drew with, so
  // a stretch dragged back to their end reaches the log's.
  const handleZoom = useCallback(
    (zoomFrom: number, zoomTo: number) => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.pushHistory(Date.now())
      trendPanelZustand.setView(
        viewWithin(zoomFrom, zoomTo, { from: oldest ?? zoomFrom, to: end }, rangeSpan, running)
      )
    },
    [end, oldest, rangeSpan, running]
  )
  const handleFollow = useTrendPanelZustand.getState().followRange
  const handleAxisZoom = useCallback((unit: string, range: AxisRange | undefined) => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.pushHistory(Date.now())
    trendPanelZustand.setAxisZoom(unit, range)
  }, [])
  // The keys, while the focus is in the trend's plots, lanes or navigator
  // and not in a field: + and - zoom, the arrows pan, Backspace goes back one
  // and Esc lets the selection go, or with none follows the log again.
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const { target } = event
      if (event.defaultPrevented || !(target instanceof HTMLElement)) return
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return
      // A panel the trend opened in a portal bubbles here too, and is not the trend.
      if (!event.currentTarget.contains(target)) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      const middle = (from + to) / 2
      const moved =
        event.key === '+' || event.key === '='
          ? zoomAround(from, to, middle, WHEEL_ZOOM)
          : event.key === '-'
            ? zoomAround(from, to, middle, 1 / WHEEL_ZOOM)
            : event.key === 'ArrowLeft'
              ? panBy(from, to, -KEY_PAN)
              : event.key === 'ArrowRight'
                ? panBy(from, to, KEY_PAN)
                : undefined
      if (moved !== undefined) handleZoom(moved.from, moved.to)
      else if (event.key === 'Backspace') trendPanelZustand.back()
      else if (event.key === 'Escape' && trendPanelZustand.selection !== undefined)
        trendPanelZustand.setSelection(undefined)
      else if (event.key === 'Escape') trendPanelZustand.followRange()
      else return
      event.preventDefault()
    },
    [from, to, handleZoom]
  )
  // A press on the plots takes the focus, so the keys work after the mouse.
  const handleFocus = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.focus()
  }, [])
  const lanes = entries.flatMap((entry): TrendLane[] => {
    const mapValue = mapValueOf(units, entry)
    if (entry.hidden === true || !isLane(entry, mapValue)) return []
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
  const firstEntry = first[0]
  // Made again only when a register or its mapping changes, so the
  // statistics are not read again on every answer.
  const registers = useMemo(
    () =>
      entries.map((entry): SelectionRegister => {
        const mapValue = mapValueOf(units, entry)
        const addressBase = units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
        const address = entry.address + Number(addressBase)
        return {
          key: trendKey(entry),
          testId: `trend-selection-row-${entry.type}-${address}`,
          label: mapValue?.comment ? `${address} ${mapValue.comment}` : String(address),
          color: entry.color,
          unit: mapValue?.unit ?? '',
          hidden: entry.hidden === true,
          convert: isLane(entry, mapValue) ? undefined : convertOf(entry, mapValue)
        }
      }),
    [entries, units]
  )

  // Every plot not given a height shares what the lanes leave of the room.
  const roomHeight = useHeightOf(scroll, true)
  const lanesHeight = useHeightOf(lanesBox, lanes.length > 0)
  const share = plotShare(roomHeight, lanesHeight, plots.length)

  const origin = oldest ?? from

  // What the image draws, as this render drew it, read when it is asked for.
  const theme = useTheme()
  const timeAxis = useRef<uPlot | null>(null)
  const handleTimeAxis = useCallback((chart: uPlot | null) => {
    timeAxis.current = chart
  }, [])
  const drawnNow = useRef({ drawn, lanes, runEnds, end, from, to, selection })
  drawnNow.current = { drawn, lanes, runEnds, end, from, to, selection }
  useEffect(() => {
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.setImage((): Promise<Blob | null> => {
      const axis = timeAxis.current
      if (axis === null) return Promise.resolve(null)
      const now = drawnNow.current
      const { openLanes, name } = useTrendPanelZustand.getState()
      const colors = laneColors(theme)
      // The stretch carries its date, and milliseconds when it is under a minute.
      const format = now.to - now.from < 60_000 ? 'yyyy-MM-dd HH:mm:ss.SSS' : 'yyyy-MM-dd HH:mm:ss'
      const stamp = (time: number): string => DateTime.fromMillis(time).toFormat(format)
      return trendImage(
        {
          plots: now.drawn.flatMap(({ plot }) => {
            const chart = charts.current.get(plot.unit)
            return chart === undefined ? [] : [chart]
          }),
          lanes: now.lanes.flatMap((lane) =>
            laneRows(
              lane,
              lane.bitmap && openLanes.includes(lane.key),
              now.runEnds,
              now.end,
              colors
            )
          ),
          timeAxis: axis,
          from: now.from,
          to: now.to,
          selection: now.selection,
          legend: [
            ...now.drawn.flatMap(({ lines }) =>
              lines.map(({ line }) => ({ color: line.color, label: line.label }))
            ),
            ...now.lanes.map((lane) => ({
              color: lane.bitmap ? colors.word : lane.color,
              label: lane.label
            }))
          ]
        },
        {
          title: name ?? 'Trend',
          stretch: `${stamp(now.from)} to ${stamp(now.to)}`,
          background: theme.palette.background.paper,
          foreground: theme.palette.text.primary,
          muted: theme.palette.text.secondary,
          bar: theme.palette.action.hover,
          band: alpha(theme.palette.info.main, 0.1),
          edge: alpha(theme.palette.info.main, 0.6),
          font: theme.typography.fontFamily ?? 'sans-serif'
        }
      )
    })
    return (): void => trendPanelZustand.setImage(() => Promise.resolve(null))
  }, [theme])

  return (
    <Box
      onKeyDown={handleKeyDown}
      sx={{ flex: '1 1 0', minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <Box
        ref={room}
        tabIndex={-1}
        onPointerDown={handleFocus}
        sx={{
          position: 'relative',
          flex: '1 1 0',
          minHeight: 0,
          display: 'flex',
          '&:focus': { outline: 'none' }
        }}
      >
        <Box
          ref={scroll}
          data-testid="trend-plots"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            overflowY: 'auto',
            // The time axis under it keeps the same gutter, so the two line up.
            scrollbarGutter: 'stable',
            px: 1,
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {drawn.map(({ plot, lines }, index) => (
            <PlotRoom
              key={plot.unit}
              index={index}
              unit={plot.unit}
              height={heights?.[plot.unit] ?? share}
            >
              <TrendPlot
                syncKey={syncKey}
                index={index}
                lines={plot.lines}
                data={lines.map(({ series }) => series)}
                unit={plot.unit}
                // A zoomed axis shows its zoom, over Fixed, over Auto.
                range={axisZoom[plot.unit] ?? axes?.[plot.unit]}
                axisZoomed={axisZoom[plot.unit] !== undefined}
                resetLabel={axes?.[plot.unit] === undefined ? 'Auto' : 'Fixed'}
                onAxisZoom={handleAxisZoom}
                drawAs={drawAs}
                from={from}
                to={to}
                oldest={oldest}
                gaps={gaps}
                onZoom={handleZoom}
                selection={selection}
                onSelect={setSelection}
                onZoomOut={handleFollow}
                onCursor={setCursor}
                onChart={handleChart}
              />
            </PlotRoom>
          ))}
          {lanes.length > 0 && (
            <Box ref={lanesBox} sx={{ flexShrink: 0 }}>
              <TrendLanes
                lanes={lanes}
                runEnds={runEnds}
                end={end}
                from={from}
                to={to}
                syncKey={syncKey}
                onZoom={handleZoom}
                selection={selection}
                onSelect={setSelection}
                onZoomOut={handleFollow}
                onCursor={setCursor}
              />
            </Box>
          )}
        </Box>
        <TrendReadout
          room={room}
          lines={drawn.flatMap(({ lines }) => lines)}
          lanes={lanes}
          runEnds={runEnds}
          time={time}
          origin={origin}
        />
      </Box>
      <Box sx={{ flexShrink: 0, px: 1, overflowY: 'hidden', scrollbarGutter: 'stable' }}>
        <TrendTimeAxis from={from} to={to} time={time} origin={origin} onChart={handleTimeAxis} />
      </Box>
      {selection !== undefined && (
        <TrendSelectionPanel
          // A script's value is none until the engine is there, and reads again once it is.
          key={String(scriptReady)}
          uuid={uuid}
          entries={entries}
          registers={registers}
          selection={selection}
          runEnds={runEnds}
          onZoom={handleZoom}
        />
      )}
      {oldest !== undefined && firstEntry !== undefined && (
        <Box sx={{ px: 1.75, pt: 0.5, pb: 1 }}>
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
})

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
              <BackButton />
            </Box>
            <Box sx={[HEADER_ROW_SX, { minWidth: 0 }]}>
              <TrendStatus uuid={uuid} />
            </Box>
          </Box>
          <Box sx={[HEADER_ROW_SX, { flexShrink: 0 }]}>
            <CsvButton />
            <HelpButton />
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
        <TrendBody uuid={uuid} entries={entries} units={units} plots={layout.plots} />
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
