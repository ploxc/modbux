import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'

interface ScanCloseButtonProps {
  disabled: boolean
  close: () => void
  testId: string
}

/**
 * The way out of a scan dialog.
 *
 * Clicking beside it used to be it, which threw away the scan you were setting
 * up on the way to anything else on screen. A button rather than a cross, so
 * it carries the same weight as the one beside it, and off while a scan runs
 * for the same reason the backdrop click was ignored then.
 */
const ScanCloseButton = meme(
  ({ disabled, close, testId }: ScanCloseButtonProps): JSX.Element => (
    <Button color="primary" disabled={disabled} onClick={close} data-testid={testId}>
      Close
    </Button>
  )
)

export default ScanCloseButton
