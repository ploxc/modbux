import Close from '@mui/icons-material/Close'
import DragIndicator from '@mui/icons-material/DragIndicator'
import Tune from '@mui/icons-material/Tune'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { NumberInput } from '@renderer/components/client/ClientGrids/RegisterGrid/columns/conversion/ConversionDialog/NumberInput'
import DraggablePanel from '@renderer/components/shared/DraggablePanel/DraggablePanel'
import { DRAG_HANDLE_CLASS } from '@renderer/components/shared/DraggablePopover/DraggablePopover'
import { meme } from '@renderer/components/shared/inputs/meme'
import { TREND_COLORS, textMuted } from '@renderer/theme'
import { ElementType, MouseEvent, ReactNode, useCallback, useState } from 'react'
import { TrendLine } from './TrendChart'
import { AxisRange, TrendSettings } from '@shared'
import { rangeOf, settingsPlace, TrendAxis } from './trendData'
import { useTrendPanelZustand } from './trendPanel.zustand'

const numberInput = NumberInput as unknown as ElementType<InputBaseComponentProps, 'input'>

/** The range an axis takes when it is first held: until it is typed, 0 to 100. */
const FIRST_RANGE: AxisRange = { min: 0, max: 100 }

const TOGGLE_SX = {
  '& .MuiToggleButton-root': { py: 0.125, px: 1, fontSize: 11.5, textTransform: 'none' }
} as const

/** The panel's paper: as wide as the popover it was, and as tall as what it holds. */
const PANEL_SX = { width: 420, px: 1.5, pt: 0.5, pb: 1, fontSize: 12.5 } as const

/** One of the panel's rows: a name, and what sets it. */
const Row = meme(
  ({ label, children }: { label: ReactNode; children: ReactNode }): JSX.Element => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 34 }}>
      <Box
        component="span"
        sx={{
          width: 64,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          color: 'text.secondary'
        }}
      >
        {label}
      </Box>
      {children}
    </Box>
  )
)

/**
 * An engineering unit's axis, named by its unit and its lines' colours: Auto
 * fits what it draws, Fixed holds it at a minimum and a maximum. The fields
 * keep what is typed, and the axis takes it once both are numbers and the
 * minimum is below the maximum.
 */
const AxisRow = meme(({ index, axis }: { index: number; axis: TrendAxis }): JSX.Element => {
  const { unit } = axis
  const range = useTrendPanelZustand((z) => z.settings.axes?.[unit])
  const [minText, setMinText] = useState(String(range?.min ?? FIRST_RANGE.min))
  const [maxText, setMaxText] = useState(String(range?.max ?? FIRST_RANGE.max))

  // Fixed takes the fields when they hold a range, and 0 to 100 when not.
  const handleMode = useCallback(
    (_event: MouseEvent<HTMLElement>, mode: 'auto' | 'fixed' | null) => {
      if (mode === null) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      if (mode === 'auto') {
        trendPanelZustand.setAxisRange(unit, undefined)
        return
      }
      const typed = rangeOf(minText, maxText)
      trendPanelZustand.setAxisRange(unit, typed ?? FIRST_RANGE)
      if (typed !== undefined) return
      setMinText(String(FIRST_RANGE.min))
      setMaxText(String(FIRST_RANGE.max))
    },
    [unit, minText, maxText]
  )
  const take = useCallback(
    (min: string, max: string) => {
      const typed = rangeOf(min, max)
      if (typed === undefined) return
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setAxisRange(unit, typed)
    },
    [unit]
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
    <Row
      label={
        <>
          <Box
            component="span"
            data-testid={`trend-axis-${index}-unit`}
            sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {unit === '' ? 'No unit' : unit}
          </Box>
          <Box component="span" sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}>
            {axis.colors.map((color) => (
              <Box
                key={color}
                component="span"
                sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }}
              />
            ))}
          </Box>
        </>
      }
    >
      <ToggleButtonGroup
        size="small"
        exclusive
        value={range === undefined ? 'auto' : 'fixed'}
        onChange={handleMode}
        sx={TOGGLE_SX}
      >
        <ToggleButton value="auto" data-testid={`trend-axis-${index}-auto`}>
          Auto
        </ToggleButton>
        <ToggleButton value="fixed" data-testid={`trend-axis-${index}-fixed`}>
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
              htmlInput: { 'data-testid': `trend-axis-${index}-min`, set: setMin }
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
              htmlInput: { 'data-testid': `trend-axis-${index}-max`, set: setMax }
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

/** A line: its swatch, which a press moves to the next colour, and its name. */
const LineRow = meme(
  ({
    lineKey,
    line,
    testId
  }: {
    lineKey: string
    line: TrendLine
    testId: string
  }): JSX.Element => {
    const handleColor = useCallback(() => {
      const trendPanelZustand = useTrendPanelZustand.getState()
      trendPanelZustand.setColor(lineKey, nextColor(line.color))
    }, [lineKey, line.color])
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
      </Box>
    )
  }
)

export interface SettingsLine {
  key: string
  line: TrendLine
  testId: string
}

/**
 * The trend's Axes and lines: a fixed range per engineering unit, the time
 * axis as the clock or as the time since the trend's start, how lines are
 * drawn, and each line's colour. A panel that drags by its title and leaves
 * the trend working beside it, so it need not cover a small floating trend.
 */
const TrendSettingsPanel = meme(
  ({ lines, axes }: { lines: SettingsLine[]; axes: TrendAxis[] }): JSX.Element => {
    const time = useTrendPanelZustand((z) => z.settings.time)
    const drawAs = useTrendPanelZustand((z) => z.settings.drawAs)
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)

    // A press opens it, and a second press closes it.
    const handleToggle = useCallback((event: MouseEvent<HTMLElement>) => {
      const button = event.currentTarget
      setAnchor((open) => (open === null ? button : null))
    }, [])
    const handleClose = useCallback(() => setAnchor(null), [])
    // Beside the floating trend, whose paper is the region named Trend.
    const opening = useCallback(
      (width: number) => {
        const button = anchor?.getBoundingClientRect() ?? new DOMRect()
        const trend = anchor?.closest('[role="region"][aria-label="Trend"]')
        return settingsPlace(button, trend?.getBoundingClientRect(), width, window.innerWidth)
      },
      [anchor]
    )
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
          aria-pressed={anchor !== null}
          data-testid="trend-settings-btn"
          onClick={handleToggle}
        >
          <Tune fontSize="small" />
        </IconButton>
        {anchor !== null && (
          <DraggablePanel
            anchor={anchor}
            opening={opening}
            onClose={handleClose}
            paperSx={PANEL_SX}
            label="Axes and lines"
          >
            <Box
              className={DRAG_HANDLE_CLASS}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                height: 34,
                cursor: 'move',
                userSelect: 'none'
              }}
            >
              <DragIndicator sx={{ fontSize: 16, color: 'text.disabled' }} />
              <Box component="span" sx={{ fontWeight: 500, flexGrow: 1 }}>
                Axes and lines
              </Box>
              <IconButton
                size="small"
                aria-label="Close Axes and lines"
                data-testid="trend-settings-close-btn"
                onClick={handleClose}
              >
                <Close fontSize="small" />
              </IconButton>
            </Box>
            <Box sx={{ fontWeight: 500, pb: 0.5 }}>An axis per engineering unit</Box>
            {axes.map((axis, index) => (
              <AxisRow key={axis.unit} index={index} axis={axis} />
            ))}
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
            {lines.map(({ key, line, testId }) => (
              <LineRow key={key} lineKey={key} line={line} testId={testId} />
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
          </DraggablePanel>
        )}
      </>
    )
  }
)

export default TrendSettingsPanel
