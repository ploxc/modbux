import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Popover from '@mui/material/Popover'
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { meme } from '@renderer/components/shared/inputs/meme'
import { textMuted } from '@renderer/theme'
import { DateTime } from 'luxon'
import { useCallback, useState } from 'react'
import { pickedStretch, SHORTEST_VIEW_MS, toSecond } from './trendData'
import { useTrendPanelZustand } from './trendPanel.zustand'

/** The calendar's fields, to the second. */
const VIEWS = ['year', 'month', 'day', 'hours', 'minutes', 'seconds'] as const
const FORMAT = 'yyyy-MM-dd HH:mm:ss'

const logTime = (millis: number): string => DateTime.fromMillis(millis).toFormat('d LLL HH:mm:ss')

interface StretchFormProps {
  /** The stretch the trend shows, which the fields start at. */
  from: number
  to: number
  /** What the log holds: its oldest sample, and now while it runs. */
  start: number
  end: number
  onClose: () => void
}

/**
 * From and To, each inside what the log holds and a second apart at least,
 * and Show, which holds the trend still on the stretch between them.
 */
const StretchForm = meme(({ from, to, start, end, onClose }: StretchFormProps): JSX.Element => {
  const [fromValue, setFromValue] = useState<DateTime | null>(() =>
    DateTime.fromMillis(toSecond(Math.max(from, start)))
  )
  const [toValue, setToValue] = useState<DateTime | null>(() =>
    DateTime.fromMillis(toSecond(Math.min(to, end)))
  )
  const stretch =
    fromValue?.isValid === true && toValue?.isValid === true
      ? pickedStretch(fromValue.toMillis(), toValue.toMillis(), start, end)
      : undefined

  const handleShow = useCallback(() => {
    if (stretch === undefined) return
    const trendPanelZustand = useTrendPanelZustand.getState()
    trendPanelZustand.setView(stretch)
    onClose()
  }, [stretch, onClose])

  const earliest = DateTime.fromMillis(toSecond(start))
  const latest = DateTime.fromMillis(end)
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box component="span" sx={{ fontWeight: 500 }}>
        Show a stretch
      </Box>
      <LocalizationProvider dateAdapter={AdapterLuxon}>
        <Box sx={{ display: 'flex', gap: 1.25 }}>
          <DateTimePicker
            label="From"
            value={fromValue}
            onChange={setFromValue}
            ampm={false}
            views={VIEWS}
            format={FORMAT}
            minDateTime={earliest}
            maxDateTime={toValue?.isValid ? toValue.minus(SHORTEST_VIEW_MS) : latest}
            slotProps={{ textField: { size: 'small', 'data-testid': 'trend-stretch-from' } }}
          />
          <DateTimePicker
            label="To"
            value={toValue}
            onChange={setToValue}
            ampm={false}
            views={VIEWS}
            format={FORMAT}
            minDateTime={fromValue?.isValid ? fromValue.plus(SHORTEST_VIEW_MS) : earliest}
            maxDateTime={latest}
            slotProps={{ textField: { size: 'small', 'data-testid': 'trend-stretch-to' } }}
          />
        </Box>
      </LocalizationProvider>
      <Box component="span" sx={{ fontSize: 11.5, color: textMuted }}>
        The log holds {logTime(start)} to {logTime(end)}.
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        <Button data-testid="trend-stretch-cancel-btn" variant="text" onClick={onClose}>
          Cancel
        </Button>
        <Button
          data-testid="trend-stretch-show-btn"
          variant="contained"
          color="success"
          disabled={stretch === undefined}
          onClick={handleShow}
        >
          Show
        </Button>
      </Box>
    </Box>
  )
})

interface TrendStretchPickerProps extends Omit<StretchFormProps, 'onClose'> {
  anchor: HTMLElement | null
  onClose: () => void
}

/** The calendar's popover, which opens with the stretch the trend shows. */
const TrendStretchPicker = meme(
  ({ anchor, onClose, ...stretch }: TrendStretchPickerProps): JSX.Element => (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { p: 1.5, fontSize: 12.5 } } }}
    >
      {anchor !== null && <StretchForm {...stretch} onClose={onClose} />}
    </Popover>
  )
)

export default TrendStretchPicker
