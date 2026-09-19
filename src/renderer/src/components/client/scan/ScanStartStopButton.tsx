import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'

interface ScanStartStopButtonProps {
  // Optional because only the unit id scan has a condition for it: it refuses
  // to start with no register type selected.
  disabled?: boolean
  scanning: boolean
  scan: () => void
  testId: string
}

/**
 * One button starts the scan and stops it, so what it says and what colour it
 * says it in are the scan's state rather than the dialog's. Both dialogs read
 * that the same way; what differs is the request behind the click.
 */
const ScanStartStopButton = meme(
  ({ disabled, scanning, scan, testId }: ScanStartStopButtonProps): JSX.Element => (
    <Button
      disabled={disabled}
      variant="contained"
      color={scanning ? 'warning' : 'primary'}
      onClick={scan}
      data-testid={testId}
    >
      {scanning ? 'Stop Scanning' : 'Start Scanning'}
    </Button>
  )
)

export default ScanStartStopButton
