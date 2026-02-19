import { Box, Paper, TextField, Typography } from '@mui/material'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useState } from 'react'

interface BitIndicatorProps {
  bitIndex: number
  value: boolean
  comment: string | undefined
  writable: boolean
  onToggle: () => void
  onCommentChange: (comment: string | undefined) => void
}

const BitIndicator = meme(
  ({
    bitIndex,
    value,
    comment,
    writable,
    onToggle,
    onCommentChange
  }: BitIndicatorProps): JSX.Element => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(comment ?? '')
    const hasMapped = !!comment?.length

    // Keep draft in sync when comment changes externally
    useEffect(() => {
      if (!editing) setDraft(comment ?? '')
    }, [comment, editing])

    const commit = useCallback(
      (text: string) => {
        setEditing(false)
        onCommentChange(text.trim() || undefined)
      },
      [onCommentChange]
    )

    return (
      <Paper
        variant="outlined"
        sx={(theme) => ({
          px: 1,
          py: 0.75,
          m: 0.375,
          maxHeight: 25,
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          opacity: hasMapped ? 1 : 0.25,
          borderColor: value ? theme.palette.success.main : undefined,
          bgcolor: value ? alpha(theme.palette.success.main, 0.07) : undefined,
          transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s',
          '&:hover': { opacity: 1 },
          overflow: 'hidden'
        })}
      >
        {/* Circle toggle */}
        <Box
          onClick={writable ? onToggle : undefined}
          sx={(theme) => ({
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            background: value ? theme.palette.success.main : theme.palette.action.disabled,
            boxShadow: value ? `0 0 5px ${theme.palette.success.main}` : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
            cursor: writable ? 'pointer' : 'default',
            '&:hover': writable
              ? { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 }
              : {}
          })}
        />

        {/* Bit index */}
        <Typography
          variant="caption"
          sx={{
            fontFamily: 'monospace',
            fontWeight: 700,
            color: 'text.secondary',
            lineHeight: 1,
            flexShrink: 0
          }}
        >
          {String(bitIndex).padStart(2, '0')}
        </Typography>

        {/* Comment — inline beside the circle and index */}
        {editing ? (
          <TextField
            variant="standard"
            size="small"
            autoFocus
            value={draft}
            color="info"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(draft)
              if (e.key === 'Escape') {
                setDraft(comment ?? '')
                setEditing(false)
              }
            }}
            sx={{ flexGrow: 1, minWidth: 0, '& input': { fontSize: '0.72rem', py: 0 } }}
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
              flexGrow: 1,
              minWidth: 0,
              lineHeight: 1.2,
              cursor: 'text',
              '&:hover': { textDecoration: 'underline dotted' }
            }}
          >
            {hasMapped ? comment : '...'}
          </Typography>
        )}
      </Paper>
    )
  }
)

export default BitIndicator
