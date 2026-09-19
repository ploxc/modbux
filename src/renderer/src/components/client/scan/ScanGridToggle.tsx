import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'
import { meme } from '@renderer/components/shared/inputs/meme'

interface ScanGridToggleProps {
  shown: boolean
  toggle: () => void
  testId: string
}

/**
 * Whether the grid keeps filling while the scan runs.
 *
 * Watching the rows arrive is the point, and it costs almost nothing now that
 * they are written in batches. It is still a choice: a slow machine, or simply
 * not wanting the movement.
 */
const ScanGridToggle = meme(
  ({ shown, toggle, testId }: ScanGridToggleProps): JSX.Element => (
    <Tooltip title={shown ? 'Hide the grid while scanning' : 'Show the grid while scanning'}>
      <IconButton
        size="small"
        color="primary"
        onClick={toggle}
        aria-label={shown ? 'Hide the grid while scanning' : 'Show the grid while scanning'}
        data-testid={testId}
      >
        {shown ? <Visibility /> : <VisibilityOff />}
      </IconButton>
    </Tooltip>
  )
)

export default ScanGridToggle
