import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { STATUS_COLORS, StatusTone } from './clientStatus'

interface StatusDotProps {
  tone: StatusTone
  /** The surface under the badge, which the dot's rim takes to stand free of it; the card's by default. */
  rim?: string
  /** How far the dot sits past the badge's corner. */
  offset: number
  /** The dot's rim in the poll colour, fading in and out. */
  polling?: boolean
  /** A ring in the tone's colour rather than a dot. */
  hollow?: boolean
}

/**
 * The status on a client's badge. A hollow ring differs from a dot in shape
 * as well as colour, for a client not connected or not reading.
 */
const StatusDot = meme(
  ({ tone, rim, offset, polling = false, hollow = false }: StatusDotProps): JSX.Element => (
    <Box
      component="span"
      sx={(theme) => {
        const edge = rim ?? theme.palette.background.paper
        return {
          position: 'absolute',
          right: -offset,
          bottom: -offset,
          width: 12,
          height: 12,
          boxSizing: 'border-box',
          borderRadius: '50%',
          background: hollow ? edge : STATUS_COLORS[tone],
          border: `2px solid ${edge}`,
          boxShadow: hollow ? `inset 0 0 0 2px ${STATUS_COLORS[tone]}` : 'none',
          ...(polling && {
            '&::after': {
              content: '""',
              position: 'absolute',
              // Over the rim rather than around it, so nothing reaches past the dot.
              inset: -2,
              borderRadius: '50%',
              border: `2px solid ${theme.palette.warning.main}`,
              animation: 'statusDotPoll 1.6s ease-in-out infinite',
              '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
            },
            '@keyframes statusDotPoll': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.15 }
            }
          })
        }
      }}
    />
  )
)

export default StatusDot
