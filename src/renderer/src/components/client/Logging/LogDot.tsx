import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'

/** The green dot every logging mark carries. */
const LogDot = meme(
  ({ size = 8 }: { size?: number }): JSX.Element => (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: 'success.main',
        flexShrink: 0
      }}
    />
  )
)

export default LogDot
