import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select, { SelectChangeEvent } from '@mui/material/Select'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand, selectedClient } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useCallback } from 'react'

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

export const TimeoutSelect = meme(() => {
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
