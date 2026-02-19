import { Box, TextField, Tooltip, Typography } from '@mui/material'
import { useCallback, useState } from 'react'

interface BitIndicatorProps {
  bitIndex: number
  value: boolean
  comment: string | undefined
  writable: boolean
  onToggle: () => void
  onCommentChange: (comment: string | undefined) => void
}

// ─────────────────────────────────────────────────────────────────────────────

const Circle = ({
  active,
  writable,
  onClick
}: {
  active: boolean
  writable: boolean
  onClick: () => void
}): JSX.Element => (
  <Box
    onClick={onClick}
    sx={(theme) => ({
      flexShrink: 0,
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: active ? theme.palette.success.main : theme.palette.action.disabled,
      boxShadow: active ? `0 0 5px ${theme.palette.success.main}88` : 'none',
      transition: 'background 0.15s, box-shadow 0.15s',
      cursor: writable ? 'pointer' : 'default',
      '&:hover': writable
        ? {
            outline: `2px solid ${theme.palette.primary.main}`,
            outlineOffset: 1
          }
        : {}
    })}
  />
)

// ─────────────────────────────────────────────────────────────────────────────

const BitIndicator = ({
  bitIndex,
  value,
  comment,
  writable,
  onToggle,
  onCommentChange
}: BitIndicatorProps): JSX.Element => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment ?? '')
  const hasMapped = comment !== undefined && comment.length > 0

  const commit = useCallback(
    (text: string) => {
      setEditing(false)
      onCommentChange(text.trim() || undefined)
    },
    [onCommentChange]
  )

  return (
    <Tooltip title={`Bit ${bitIndex}`} placement="top" arrow disableInteractive>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.75,
          py: 0.5,
          borderRadius: 1,
          opacity: hasMapped ? 1 : 0.45,
          transition: 'opacity 0.15s',
          '&:hover': { opacity: 1, bgcolor: 'action.hover' }
        }}
      >
        <Circle active={value} writable={writable} onClick={onToggle} />

        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            color: 'text.secondary',
            userSelect: 'none',
            minWidth: 18,
            lineHeight: 1
          }}
        >
          {bitIndex}
        </Typography>

        {editing ? (
          <TextField
            variant="standard"
            size="small"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(draft)
              if (e.key === 'Escape') {
                setDraft(comment ?? '')
                setEditing(false)
              }
            }}
            sx={{ flex: 1, minWidth: 0, '& input': { fontSize: '0.72rem', py: 0, lineHeight: 1 } }}
          />
        ) : (
          <Typography
            variant="caption"
            noWrap
            title={comment}
            onClick={() => {
              setDraft(comment ?? '')
              setEditing(true)
            }}
            sx={{
              flex: 1,
              minWidth: 0,
              cursor: 'text',
              color: hasMapped ? 'text.primary' : 'text.disabled',
              fontStyle: hasMapped ? 'normal' : 'italic',
              lineHeight: 1,
              '&:hover': { textDecoration: 'underline dotted' }
            }}
          >
            {hasMapped ? comment : 'add comment…'}
          </Typography>
        )}
      </Box>
    </Tooltip>
  )
}

export default BitIndicator
