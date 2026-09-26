import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import Check from '@mui/icons-material/Check'
import ContentCopy from '@mui/icons-material/ContentCopy'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useState } from 'react'

/**
 * A shell command shown before it runs, with a copy button.
 *
 * Both Linux modals loosen something system-wide, so they put the command on
 * screen rather than describing it. `copied` is local on purpose: two seconds
 * of a changed icon belongs to this element and nothing else reads it.
 */
interface CommandBlockProps {
  command: string
  testId: string
  /** The line above the box, left out where an alert already says what the box is. */
  label?: string
}

const CommandBlock = meme(({ command, testId, label }: CommandBlockProps): JSX.Element => {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard can be unavailable; the command stays selectable on screen.
    }
  }, [command])

  const box = (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        py: 0.75,
        pr: 1,
        pl: 1.5,
        borderRadius: 1,
        border: '1px solid #2a2a2a',
        // A shade below the dialog surface.
        background: '#141414'
      }}
    >
      <Typography
        component="code"
        data-testid={testId}
        sx={{
          flex: 1,
          fontFamily: 'monospace',
          fontSize: 12,
          lineHeight: '18px',
          color: '#d4d4d4',
          userSelect: 'all',
          wordBreak: 'break-all'
        }}
      >
        {command}
      </Typography>
      <Tooltip title={copied ? 'Copied' : 'Copy'}>
        <IconButton
          data-testid={`${testId}-copy-btn`}
          size="small"
          onClick={handleCopy}
          aria-label="Copy command"
        >
          {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Box>
  )

  if (!label) return box
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      <Typography sx={{ fontSize: 12, color: '#a3a3a3' }}>{label}</Typography>
      {box}
    </Box>
  )
})

export default CommandBlock
