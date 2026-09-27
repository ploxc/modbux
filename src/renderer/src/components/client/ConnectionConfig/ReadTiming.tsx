import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand, selectedClient } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import Box from '@mui/material/Box'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import IconButton from '@mui/material/IconButton'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Timer from '@mui/icons-material/Timer'
import { MouseEvent, useCallback, useState } from 'react'

/** What `ReadTimingSchema` admits: 1000 to 10000 ms in steps of 1000. */
const READ_TIMINGS = Array.from({ length: 10 }, (_, i) => (i + 1) * 1000)

const seconds = (milliseconds: number): string => `${milliseconds / 1000} s`

interface ReadTimingFieldProps {
  label: string
  testId: string
  value: number
  onChange: (milliseconds: number) => void
}

const ReadTimingField = meme(({ label, testId, value, onChange }: ReadTimingFieldProps) => {
  const labelId = `${testId}-label`
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // Disabled while polling, as the popover it replaced was.
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)

  const handleChange = useCallback(
    (event: SelectChangeEvent<number>): void => onChange(Number(event.target.value)),
    [onChange]
  )

  return (
    <FormControl size="large" sx={{ width: 62, flexShrink: 0 }}>
      <InputLabel id={labelId}>{label}</InputLabel>
      <Select
        disabled={polling}
        size="large"
        labelId={labelId}
        label={label}
        value={value}
        onChange={handleChange}
        renderValue={seconds}
        data-testid={testId}
      >
        {READ_TIMINGS.map((milliseconds) => (
          <MenuItem key={milliseconds} value={milliseconds}>
            {seconds(milliseconds)}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  )
})

export const PollRateSelect = meme(() => {
  const pollRate = useClientZustand((z) => selectedClient(z).registerConfig.pollRate)
  const setPollRate = useClientZustand.getState().setPollRate
  return (
    <ReadTimingField
      label="Poll rate"
      testId="poll-rate-select"
      value={pollRate}
      onChange={setPollRate}
    />
  )
})

const TimeoutSelect = meme(() => {
  const timeout = useClientZustand((z) => selectedClient(z).registerConfig.timeout)
  const setTimeout = useClientZustand.getState().setTimeout
  return (
    <ReadTimingField
      label="Timeout"
      testId="timeout-select"
      value={timeout}
      onChange={setTimeout}
    />
  )
})

/** The class of Poll rate and Timeout side by side, which the top bar hides when it narrows. */
export const READ_TIMING_INLINE = 'read-timing-inline'
/** The class of the timer button, which the top bar shows instead. */
export const READ_TIMING_TOGGLE = 'read-timing-toggle'

/**
 * Poll rate and Timeout side by side, or behind a timer button that opens
 * them in a column; which one shows is the top bar's width to decide.
 */
export const ReadTiming = meme(() => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)

  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.currentTarget
    setAnchor((open) => (open ? null : target))
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  return (
    <>
      <Box className={READ_TIMING_INLINE} sx={{ display: 'flex', gap: 1.5 }}>
        <PollRateSelect />
        <TimeoutSelect />
      </Box>
      {/* On mousedown, as the serial field: a select opens its menu on mousedown. */}
      <ClickAwayListener mouseEvent="onMouseDown" onClickAway={handleClose}>
        <Box className={READ_TIMING_TOGGLE}>
          <IconButton
            size="large"
            aria-label="Poll rate and timeout"
            title="Poll rate and timeout"
            data-testid="read-timing-btn"
            onClick={handleOpen}
          >
            <Timer fontSize="small" />
          </IconButton>
          <Popper
            open={anchor !== null}
            anchorEl={anchor}
            placement="bottom-start"
            sx={(theme) => ({ zIndex: theme.zIndex.modal })}
          >
            <Paper sx={{ mt: 1, p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <PollRateSelect />
              <TimeoutSelect />
            </Paper>
          </Popper>
        </Box>
      </ClickAwayListener>
    </>
  )
})
