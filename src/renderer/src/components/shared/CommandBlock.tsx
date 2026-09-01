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
const CommandBlock = meme(
  ({ command, testId }: { command: string; testId: string }): JSX.Element => {
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

    return (
      <Box
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 1,
          pl: 1.5,
          borderRadius: 1,
          border: `1px solid ${theme.palette.divider}`,
          // A shade up from the dialog surface, as the scan modals nest theirs.
          background: theme.palette.background.paper
        })}
      >
        <Typography
          component="code"
          data-testid={testId}
          sx={{
            flex: 1,
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            userSelect: 'all',
            wordBreak: 'break-all'
          }}
        >
          {command}
        </Typography>
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton size="small" onClick={handleCopy} aria-label="Copy command">
            {copied ? <Check fontSize="small" /> : <ContentCopy fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Box>
    )
  }
)

export default CommandBlock
