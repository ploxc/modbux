import Close from '@mui/icons-material/Close'
import DragIndicator from '@mui/icons-material/DragIndicator'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { applyConversion } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/convertedValue'
import {
  DRAG_HANDLE_CLASS,
  default as DraggablePopover
} from '@renderer/components/shared/DraggablePopover/DraggablePopover'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { useScriptEngineZustand } from '@renderer/conversion/scriptEngine.zustand'
import { textMuted } from '@renderer/theme'
import { ClientUnit, isNumberRegister, RegisterMapValue } from '@shared'
import { useCallback, useMemo } from 'react'
import TrendChart, { TrendLine } from './TrendChart'
import { TREND_WINDOW_MS, trendSeries, trendSummary } from './trendData'
import { DrawnEntry, TrendEntry, trendKey, useTrendPopoverZustand } from './trendPopover.zustand'
import { useLogWindows } from './useLogWindows'

const PAPER_SX = {
  p: 0,
  width: 520,
  height: 300,
  minWidth: 420,
  minHeight: 240,
  resize: 'both',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
} as const

const NO_UNITS: ClientUnit[] = []

/**
 * The trend opens in the grid's top right corner, clear of the address column
 * where the Log icons that add to it are: opened under a row, it covered the
 * rows below it.
 */
const TOP_RIGHT = { vertical: 'top', horizontal: 'right' } as const

/** A number as the trend's figures write it: as the value came, at most six decimals. */
const figure = (value: number | undefined): string =>
  value === undefined ? '–' : String(Math.round(value * 1e6) / 1e6)

/** The mapping entry of the register a trend line draws. */
const mapValueOf = (units: ClientUnit[], entry: TrendEntry): RegisterMapValue | undefined =>
  units.find(({ uuid }) => uuid === entry.unit)?.registerMapping[entry.type][entry.address]

/**
 * Each line's colour and scale. Lines of one engineering unit share a scale:
 * the first unit's is on the left axis, the second's on the right, and a line
 * of any unit after that is scaled on its own, with no axis.
 */
const layoutOf = (
  entries: DrawnEntry[],
  units: ClientUnit[]
): { lines: TrendLine[]; leftScale: string | undefined; rightScale: string | undefined } => {
  const engineeringUnits: string[] = []
  const lines = entries.map((entry): TrendLine => {
    const engineeringUnit = mapValueOf(units, entry)?.unit ?? ''
    if (!engineeringUnits.includes(engineeringUnit)) engineeringUnits.push(engineeringUnit)
    const rank = engineeringUnits.indexOf(engineeringUnit)
    return {
      color: entry.color,
      scale: rank < 2 ? `unit:${engineeringUnit}` : `line:${trendKey(entry)}`
    }
  })
  const [left, right] = engineeringUnits
  return {
    lines,
    leftScale: left === undefined ? undefined : `unit:${left}`,
    rightScale: right === undefined ? undefined : `unit:${right}`
  }
}

/** One register of the trend: its colour, address, name and last value, and a press that takes it out. */
const TrendChip = meme(
  ({ entry, last }: { entry: DrawnEntry; last: number | undefined }): JSX.Element => {
    const addressBase = useClientZustand(
      (z) =>
        z.clients[entry.uuid]?.units.find(({ uuid }) => uuid === entry.unit)?.addressBase ?? '0'
    )
    const comment = useClientZustand(
      (z) => mapValueOf(z.clients[entry.uuid]?.units ?? NO_UNITS, entry)?.comment
    )
    const engineeringUnit = useClientZustand(
      (z) => mapValueOf(z.clients[entry.uuid]?.units ?? NO_UNITS, entry)?.unit
    )
    const handleRemove = useCallback(() => {
      const trendPopoverZustand = useTrendPopoverZustand.getState()
      trendPopoverZustand.remove(trendKey(entry))
    }, [entry])
    const address = entry.address + Number(addressBase)

    return (
      <Box
        component="span"
        data-testid={`trend-chip-${address}`}
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
        <Box
          component="span"
          data-testid={`trend-chip-value-${address}`}
          sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
        >
          {figure(last)} {engineeringUnit}
        </Box>
        <IconButton
          size="small"
          aria-label={`Take ${address} out of the trend`}
          data-testid={`trend-chip-remove-${address}`}
          onClick={handleRemove}
          sx={{ p: 0.25 }}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    )
  }
)

/**
 * The registers a Log icon in Monitor added, as lines over the last 10
 * minutes of the log, converted as the grid converts them, in a popover that
 * drags by its title, resizes from its corner, and leaves Monitor working
 * under it. It moves while the log
 * runs, and otherwise shows the 10 minutes before the log last stopped.
 */
const TrendPopover = meme((): JSX.Element | null => {
  const entries = useTrendPopoverZustand((z) => z.entries)
  const anchor = useTrendPopoverZustand((z) => z.anchor)
  const uuid = entries[0]?.uuid ?? ''
  const units = useClientZustand((z) => z.clients[uuid]?.units ?? NO_UNITS)
  const running = useLiveZustand((z) => dataOf(z, uuid).clientState.log.running)
  const runEndsKey = useLiveZustand((z) =>
    dataOf(z, uuid)
      .clientState.log.runs.map(({ end }) => end ?? '')
      .join(',')
  )
  const lastEnd = useLiveZustand((z) => dataOf(z, uuid).clientState.log.runs.at(-1)?.end)
  // A script's value waits for the engine, and draws again once it is there.
  useScriptEngineZustand((z) => z.ready)

  const points = useLogWindows(entries, running, lastEnd)
  const layout = useMemo(() => layoutOf(entries, units), [entries, units])

  // Converted again on every render, which comes with each answer, a store
  // change or the script engine turning ready. A script conversion measured
  // about 1.9 µs a call, so the 6,000 samples of 10 minutes at 100 ms polls
  // take about 11 ms a register.
  const runEnds = runEndsKey
    .split(',')
    .filter((end) => end !== '')
    .map(Number)
  const drawn = entries.map((entry) => {
    const mapValue = mapValueOf(units, entry)
    const convert = (raw: number): number | undefined => {
      if (!isNumberRegister(entry.type)) return raw
      const converted = applyConversion(String(raw), mapValue?.dataType, mapValue?.conversion)
      return typeof converted === 'number' ? converted : undefined
    }
    return { entry, series: trendSeries(points[trendKey(entry)] ?? [], runEnds, convert) }
  })

  // Live, the range ends now, and moves with each answer; stopped, where the
  // log stopped.
  const to = running ? Date.now() : (lastEnd ?? Date.now())
  const handleClose = useCallback(() => {
    const trendPopoverZustand = useTrendPopoverZustand.getState()
    trendPopoverZustand.close()
  }, [])

  if (anchor === null) return null
  return (
    <DraggablePopover
      anchor={anchor}
      onClose={handleClose}
      paperSx={PAPER_SX}
      modeless
      anchorOrigin={TOP_RIGHT}
      transformOrigin={TOP_RIGHT}
    >
      <Box
        data-testid="trend-popover"
        sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%', fontSize: 12.5 }}
      >
        <Box
          className={DRAG_HANDLE_CLASS}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            pl: 0.75,
            pr: 1,
            pt: 0.75,
            userSelect: 'none',
            cursor: 'move'
          }}
        >
          <DragIndicator sx={{ fontSize: 16, color: 'text.disabled' }} />
          <Box component="span" sx={{ fontWeight: 500 }}>
            Trend
          </Box>
          <Box component="span" sx={{ color: textMuted }}>
            · last 10 minutes
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Box
            component="span"
            data-testid="trend-state"
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.625,
              fontSize: 11.5,
              color: running ? 'success.light' : textMuted
            }}
          >
            {running && (
              <Box
                component="span"
                sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'success.main' }}
              />
            )}
            {running ? 'live' : 'logging is off'}
          </Box>
          <IconButton
            size="small"
            aria-label="Close the trend"
            data-testid="trend-close-btn"
            onClick={handleClose}
          >
            <Close fontSize="small" />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, px: 1.75 }}>
          {drawn.map(({ entry, series }) => (
            <TrendChip
              key={trendKey(entry)}
              entry={entry}
              last={trendSummary(series.values).last}
            />
          ))}
        </Box>
        <Box sx={{ flexGrow: 1, minHeight: 0, display: 'flex', px: 1, pb: 1 }}>
          <TrendChart
            lines={layout.lines}
            data={drawn.map(({ series }) => series)}
            leftScale={layout.leftScale}
            rightScale={layout.rightScale}
            from={to - TREND_WINDOW_MS}
            to={to}
          />
        </Box>
      </Box>
    </DraggablePopover>
  )
})

export default TrendPopover
