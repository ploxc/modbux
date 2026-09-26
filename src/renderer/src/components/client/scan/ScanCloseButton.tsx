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
 * A text button in the dialog's band, beside Start. A click beside the dialog is ignored, because reaching for
 * anything else on screen would throw away the scan you were setting up;
 * Escape still closes, which both dialogs say where they take it. Off while a
 * scan runs.
 */
const ScanCloseButton = meme(
  ({ disabled, close, testId }: ScanCloseButtonProps): JSX.Element => (
    <Button variant="text" disabled={disabled} onClick={close} data-testid={testId}>
      Close
    </Button>
  )
)

export default ScanCloseButton
