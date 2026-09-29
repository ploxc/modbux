import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import LogDot from './LogDot'

/**
 * On a client card while its log takes samples, so a client that is not on
 * screen and still logs can be seen to.
 */
const RecBadge = meme(
  ({ uuid }: { uuid: string }): JSX.Element => (
    <Box
      component="span"
      data-testid={`client-rec-${uuid}`}
      sx={(theme) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 0.625,
        height: 20,
        px: 0.875,
        flexShrink: 0,
        borderRadius: '10px',
        fontSize: 11,
        fontWeight: 500,
        color: theme.palette.success.light,
        background: alpha(theme.palette.success.main, 0.14)
      })}
    >
      <LogDot size={6} />
      REC
    </Box>
  )
)

export default RecBadge
