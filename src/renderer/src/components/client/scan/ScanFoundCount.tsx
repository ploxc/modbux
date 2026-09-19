import Typography from '@mui/material/Typography'
import { meme } from '@renderer/components/shared/inputs/meme'

interface ScanFoundCountProps {
  count: number
  testId: string
}

/**
 * A scan that turns up nothing looks exactly like a scan still warming up, and
 * the grid behind shows the first rows rather than how many there are.
 *
 * Plain text rather than a chip. A chip is a badge on something, and this is a
 * reading: it belongs beside the buttons the way a number belongs on a gauge.
 * The colour carries the same thing the text does, so `data-found` says it
 * once for anything reading the page.
 */
const ScanFoundCount = meme(
  ({ count, testId }: ScanFoundCountProps): JSX.Element => (
    <Typography
      variant="body2"
      sx={(theme) => ({
        fontFamily: 'monospace',
        whiteSpace: 'nowrap',
        color: count > 0 ? theme.palette.success.main : theme.palette.warning.main
      })}
      data-testid={testId}
      data-found={count > 0}
    >
      Found: {count}
    </Typography>
  )
)

export default ScanFoundCount
