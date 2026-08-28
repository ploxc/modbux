import { InputBaseComponentProps, LinearProgress, TextField } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { ElementType, forwardRef } from 'react'
import { IMaskInput, IMask } from 'react-imask'

// Scan progress
export const ScanProgress = meme(() => {
  const scanning = useRootZustand(
    (z) => z.clientState.scanningUniId || z.clientState.scanningRegisters
  )
  const scanProgress = useRootZustand((z) => z.scanProgress)

  return scanning ? (
    <LinearProgress
      variant="determinate"
      value={scanProgress}
      color="primary"
      sx={{
        width: '100%',
        '& .MuiLinearProgress-bar1Determinate': { transition: 'none', animation: 'none' }
      }}
    />
  ) : null
})

/**
 * The timeout a scan gives each request, in milliseconds. Zero switches the
 * timer off in modbus-serial and the scan then hangs on the first silent unit;
 * ten seconds an address is already a long afternoon.
 *
 * The bounds stay off the mask, which rewrites what you type: clearing the
 * field stores 0, the mask commits that up to its floor, and the digits land
 * behind it. Typing 500 into an empty field gave 10000.
 */
export const SCAN_TIMEOUT_MIN = 100
export const SCAN_TIMEOUT_MAX = 10000

export const scanTimeoutOutOfRange = (timeout: number): boolean =>
  timeout < SCAN_TIMEOUT_MIN || timeout > SCAN_TIMEOUT_MAX

const TimeoutInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      inputRef={ref}
      onAccept={(value) => set(value, true)}
    />
  )
})

TimeoutInputForward.displayName = 'TimeoutInput'
export const TimeoutInput = meme(TimeoutInputForward)

interface TimeoutFieldProps {
  disabled: boolean
  timeout: number
  setTimeout: MaskSetFn
  testId: string
}

/** Both scan dialogs ask for the same timeout, and ask for it the same way. */
export const ScanTimeoutField = meme(
  ({ disabled, timeout, setTimeout, testId }: TimeoutFieldProps): JSX.Element => (
    <TextField
      disabled={disabled}
      label="Timeout (ms)"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={String(timeout)}
      error={scanTimeoutOutOfRange(timeout)}
      helperText={`${SCAN_TIMEOUT_MIN} - ${SCAN_TIMEOUT_MAX}`}
      data-testid={testId}
      slotProps={{
        input: {
          inputComponent: TimeoutInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setTimeout })
        }
      }}
    />
  )
)
