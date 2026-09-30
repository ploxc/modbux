import Tune from '@mui/icons-material/Tune'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Popover from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { NumberInput } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/conversion/ConversionDialog/NumberInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { TREND_COLORS, textMuted } from '@renderer/theme'
import { ElementType, MouseEvent, ReactNode, useCallback, useState } from 'react'
import { TrendLine } from './TrendChart'
import { AxisRange, rangeOf, TrendSettings, TrendSide } from './trendData'
import { useTrendPanelZustand } from './trendPanel.zustand'

const numberInput = NumberInput as unknown as ElementType<InputBaseComponentProps, 'input'>

/** The range a side takes when it is first held: until it is typed, 0 to 100. */
const FIRST_RANGE: AxisRange = { min: 0, max: 100 }

const TOGGLE_SX = {
  '& .MuiToggleButton-root': { py: 0.125, px: 1, fontSize: 11.5, textTransform: 'none' }
} as const

/** One of the popover's rows: a name, and what sets it. */
const Row = meme(
  ({ label, children }: { label: string; children: ReactNode }): JSX.Element => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 34 }}>
      <Box component="span" sx={{ width: 64, flexShrink: 0, color: 'text.secondary' }}>
        {label}
      </Box>
      {children}
    </Box>
  )
)

/**
 * A side's range: Auto fits what it draws, Fixed holds it at a minimum and a
 * maximum. The fields keep what is typed, and the side takes it once both
 * are numbers and the minimum is below the maximum.
 */
const AxisRow = meme(({ side }: { side: TrendSide }): JSX.Element => {
  const range = useTrendPanelZustand((z) => z.settings[side])
  const [minText, setMinText] = useState(String(range?.min ?? FIRST_RANGE.min))
  const [maxText, setMaxText] = useState(String(range?.max ?? FIRST_RANGE.max))

  // Fixed takes the fields when they hold a range, and 0 to 100 when not.
  const handleMode = useCallback(
    (_event: MouseEvent<HTMLElement>, mode: 'auto' | 'fixed' | null) => {
      if (mode === null) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      if (mode === 'auto') {
        trendPanelZustand.setAxisRange(side, undefined)
        return
      }
      const typed = rangeOf(minText, maxText)
      trendPanelZustand.setAxisRange(side, typed ?? FIRST_RANGE)
      if (typed !== undefined) return
      setMinText(String(FIRST_RANGE.min))
      setMaxText(String(FIRST_RANGE.max))
    },
    [side, minText, maxText]
  )
  const take = useCallback(
    (min: string, max: string) => {
      const typed = rangeOf(min, max)
      if (typed === undefined) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setAxisRange(side, typed)
    },
    [side]
  )
  const setMin = useCallback(
    (text: string) => {
      setMinText(text)
      take(text, maxText)
    },
    [take, maxText]
  )
  const setMax = useCallback(
    (text: string) => {
      setMaxText(text)
      take(minText, text)
    },
    [take, minText]
  )
  const wrong = rangeOf(minText, maxText) === undefined

  return (
    <Row label={side === 'left' ? 'Left' : 'Right'}>
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range === undefined ? 'auto' : 'fixed'}
        onChange={handleMode}
        sx={TOGGLE_SX}
      >
        <ToggleButton value="auto" data-testid={`trend-axis-${side}-auto`}>
          Auto
        </ToggleButton>
        <ToggleButton value="fixed" data-testid={`trend-axis-${side}-fixed`}>
          Fixed
        </ToggleButton>
      </ToggleButtonGroup>
      {range === undefined ? (
        <Box component="span" sx={{ fontSize: 11.5, color: textMuted }}>
          fits what it draws
        </Box>
      ) : (
        <>
          <TextField
            size="small"
            value={minText}
            error={wrong}
            slotProps={{
              input: { inputComponent: numberInput },
              htmlInput: { 'data-testid': `trend-axis-${side}-min`, set: setMin }
            }}
            sx={{ width: 76 }}
          />
          <Box component="span" sx={{ color: textMuted }}>
            to
          </Box>
          <TextField
            size="small"
            value={maxText}
            error={wrong}
            slotProps={{
              input: { inputComponent: numberInput },
              htmlInput: { 'data-testid': `trend-axis-${side}-max`, set: setMax }
            }}
            sx={{ width: 76 }}
          />
        </>
      )}
    </Row>
  )
})

/** The next colour of the palette after `color`, which a press on a line's swatch gives it. */
const nextColor = (color: string): string => {
  const at = TREND_COLORS.findIndex((each) => each === color)
  return TREND_COLORS[(at + 1) % TREND_COLORS.length] ?? color
}

/** A line: its swatch, which a press moves to the next colour, and its side. */
const LineRow = meme(
  ({
    lineKey,
    line,
    side,
    testId
  }: {
    lineKey: string
    line: TrendLine
    side: TrendSide | undefined
    testId: string
  }): JSX.Element => {
    const handleColor = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setColor(lineKey, nextColor(line.color))
    }, [lineKey, line.color])
    // Auto draws it on its engineering unit's side.
    const handleSide = useCallback(
      (_event: MouseEvent<HTMLElement>, picked: TrendSide | 'auto' | null) => {
        if (picked === null) return
        const trendPanelZustand = useTrendPanelZustand.getState()
        trendPanelZustand.setSide(lineKey, picked === 'auto' ? undefined : picked)
      },
      [lineKey]
    )
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 32 }}>
        <IconButton
          size="small"
          aria-label={`The colour of ${line.label}, pressed for the next`}
          data-testid={`${testId}-color`}
          onClick={handleColor}
          sx={{ p: 0.5 }}
        >
          <Box sx={{ width: 14, height: 14, borderRadius: '3px', bgcolor: line.color }} />
        </IconButton>
        <Box
          component="span"
          sx={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {line.label}
        </Box>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={side ?? 'auto'}
          onChange={handleSide}
          sx={TOGGLE_SX}
        >
          <ToggleButton value="auto" data-testid={`${testId}-auto`}>
            Auto
          </ToggleButton>
          <ToggleButton value="left" data-testid={`${testId}-left`}>
            Left
          </ToggleButton>
          <ToggleButton value="right" data-testid={`${testId}-right`}>
            Right
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>
    )
  }
)

export interface SettingsLine {
  key: string
  line: TrendLine
  /** The side it is set to; none draws it on its engineering unit's. */
  side: TrendSide | undefined
  testId: string
}

/**
 * The trend's Axes and lines: a fixed range per side, the time axis as the
 * clock or as the time since the trend's start, how lines are drawn, and each
 * line's colour and side.
 */
const TrendSettingsPopover = meme(({ lines }: { lines: SettingsLine[] }): JSX.Element => {
  const time = useTrendPanelZustand((z) => z.settings.time)
  const drawAs = useTrendPanelZustand((z) => z.settings.drawAs)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])
  const handleTime = useCallback(
    (_event: MouseEvent<HTMLElement>, picked: TrendSettings['time'] | null) => {
      if (picked === null) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setTime(picked)
    },
    []
  )
  const handleDrawAs = useCallback(
    (_event: MouseEvent<HTMLElement>, picked: TrendSettings['drawAs'] | null) => {
      if (picked === null) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setDrawAs(picked)
    },
    []
  )

  return (
    <>
      <IconButton
        size="small"
        aria-label="Axes and lines"
        title="Axes and lines"
        data-testid="trend-settings-btn"
        onClick={handleOpen}
      >
        <Tune fontSize="small" />
      </IconButton>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 420, px: 1.5, py: 1, fontSize: 12.5 } } }}
      >
        <Box sx={{ fontWeight: 500, pb: 0.5 }}>Axes</Box>
        <AxisRow side="left" />
        <AxisRow side="right" />
        <Row label="Time">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={time}
            onChange={handleTime}
            sx={TOGGLE_SX}
          >
            <ToggleButton value="clock" data-testid="trend-time-clock">
              Clock
            </ToggleButton>
            <ToggleButton value="since" data-testid="trend-time-since">
              Since start
            </ToggleButton>
          </ToggleButtonGroup>
        </Row>
        <Box sx={{ height: '1px', my: 1, bgcolor: 'divider' }} />
        <Box sx={{ fontWeight: 500, pb: 0.5 }}>Lines</Box>
        {lines.map(({ key, line, side, testId }) => (
          <LineRow key={key} lineKey={key} line={line} side={side} testId={testId} />
        ))}
        <Row label="Draw as">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={drawAs}
            onChange={handleDrawAs}
            sx={TOGGLE_SX}
          >
            <ToggleButton value="lines" data-testid="trend-draw-lines">
              Lines
            </ToggleButton>
            <ToggleButton value="steps" data-testid="trend-draw-steps">
              Steps
            </ToggleButton>
            <ToggleButton value="points" data-testid="trend-draw-points">
              Points
            </ToggleButton>
          </ToggleButtonGroup>
        </Row>
      </Popover>
    </>
  )
})

export default TrendSettingsPopover
