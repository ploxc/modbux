import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { STATUS_COLORS, StatusTone } from './clientStatus'

interface StatusDotProps {
  tone: StatusTone
  /** The surface under the badge, which the dot's rim takes to stand free of it; the card's by default. */
  rim?: string
  /** How far the dot sits past the badge's corner. */
  offset: number
}

/**
 * The status on a client's badge. A client that is not connected shows a
 * hollow ring, so it differs from a connected one in shape as well as colour.
 */
const StatusDot = meme(({ tone, rim, offset }: StatusDotProps): JSX.Element => {
  const idle = tone === 'idle'
  return (
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
          background: idle ? edge : STATUS_COLORS[tone],
          border: `2px solid ${edge}`,
          boxShadow: idle ? `inset 0 0 0 2px ${STATUS_COLORS.idle}` : 'none'
        }
      }}
    />
  )
})

export default StatusDot
