import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import { integerMask } from '@renderer/components/shared/inputs/integerMask'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { MaskSetFn } from '@renderer/context/client.zustand.types'
import { SCAN_TIMEOUT_MAX, SCAN_TIMEOUT_MIN } from '@shared'
import { ElementType, forwardRef } from 'react'
import { IMaskInput } from 'react-imask'

/**
 * The bounds stay off the mask, which rewrites what you type: clearing the
 * field stores 0, the mask commits that up to its floor, and the digits land
 * behind it. Typing 500 into an empty field gave 10000. Leaving the field is
 * late enough to correct it.
 */
export const clampScanTimeout = (timeout: number): number =>
  Math.min(SCAN_TIMEOUT_MAX, Math.max(SCAN_TIMEOUT_MIN, timeout))

const TimeoutInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  return (
    <IMaskInput
      {...other}
      {...integerMask}
      min={0}
      inputRef={ref}
      onAccept={(value) => set(value, true)}
    />
  )
})

TimeoutInputForward.displayName = 'TimeoutInput'
const TimeoutInput = meme(TimeoutInputForward)

interface ScanTimeoutFieldProps {
  disabled: boolean
  timeout: number
  setTimeout: MaskSetFn
  testId: string
}

/**
 * Both scan dialogs ask for the same timeout, and ask for it the same way.
 *
 * Each dialog wraps this in a component of its own, which reads its own store
 * and passes its own test id. The wrapper stays because the store has to be
 * named where it is read: `conformance.test.ts` matches a selector by its
 * callee, `/^use[A-Z].*Zustand$/`, so a store hook arriving as a prop is a
 * subscription the meter does not see.
 */
const ScanTimeoutField = meme(
  ({ disabled, timeout, setTimeout, testId }: ScanTimeoutFieldProps): JSX.Element => (
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

export default ScanTimeoutField
