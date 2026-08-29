import {
  Button,
  Chip,
  IconButton,
  InputBaseComponentProps,
  LinearProgress,
  TextField,
  Tooltip
} from '@mui/material'
import { Close, Visibility, VisibilityOff } from '@mui/icons-material'
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
 * behind it. Typing 500 into an empty field gave 10000. Leaving the field is
 * late enough to correct it.
 */
export const SCAN_TIMEOUT_MIN = 100
export const SCAN_TIMEOUT_MAX = 10000

export const clampScanTimeout = (timeout: number): number =>
  Math.min(SCAN_TIMEOUT_MAX, Math.max(SCAN_TIMEOUT_MIN, timeout))

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
      onBlur={() => setTimeout(String(clampScanTimeout(timeout)))}
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

interface ScanFoundChipProps {
  count: number
  testId: string
}

/** A scan that turns up nothing looks exactly like a scan still warming up. */
export const ScanFoundChip = meme(
  ({ count, testId }: ScanFoundChipProps): JSX.Element => (
    <Chip
      size="small"
      label={`Found: ${count}`}
      color={count > 0 ? 'success' : 'warning'}
      variant={count > 0 ? 'filled' : 'outlined'}
      data-testid={testId}
    />
  )
)

interface ScanCloseButtonProps {
  disabled: boolean
  close: () => void
  testId: string
}

/**
 * The way out of a scan dialog.
 *
 * Clicking beside it used to be it, which threw away the scan you were setting
 * up on the way to anything else on screen. A button rather than a bare cross,
 * so it carries the same weight as the one beside it, and off while a scan
 * runs for the same reason the backdrop click was ignored then.
 */
export const ScanCloseButton = meme(
  ({ disabled, close, testId }: ScanCloseButtonProps): JSX.Element => (
    <Button
      color="primary"
      startIcon={<Close />}
      disabled={disabled}
      onClick={close}
      data-testid={testId}
    >
      Close
    </Button>
  )
)

interface ScanGridToggleProps {
  shown: boolean
  toggle: () => void
}

/**
 * Whether the grid keeps filling while the scan runs.
 *
 * Watching the rows arrive is the point, and it costs almost nothing now that
 * they are written in batches. It is still a choice: a slow machine, or simply
 * not wanting the movement.
 */
export const ScanGridToggle = meme(
  ({ shown, toggle }: ScanGridToggleProps): JSX.Element => (
    <Tooltip title={shown ? 'Hide the grid while scanning' : 'Show the grid while scanning'}>
      <IconButton
        size="small"
        color="primary"
        onClick={toggle}
        aria-label={shown ? 'Hide the grid while scanning' : 'Show the grid while scanning'}
        data-testid="scan-grid-toggle-btn"
      >
        {shown ? <Visibility /> : <VisibilityOff />}
      </IconButton>
    </Tooltip>
  )
)
