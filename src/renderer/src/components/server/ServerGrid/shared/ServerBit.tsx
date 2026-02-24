import { Box, TextField, Typography, alpha } from '@mui/material'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useState } from 'react'

export interface ServerBitProps {
  bitIndex: number
  active: boolean
  comment: string | undefined
  onToggle: () => void
  onCommentChange: (comment: string | undefined) => void
  testIdPrefix?: string
  /** Number of digits to pad the index label (default: 2) */
  padDigits?: number
  /** Dim unmapped rows (default: true) */
  dimUnmapped?: boolean
  /** Show hover background on this row (default: true) */
  hoverHighlight?: boolean
  /** Disable toggle & comment editing (default: false) */
  readOnly?: boolean
}

const ServerBit = meme(
  ({
    bitIndex,
    active,
    comment,
    onToggle,
    onCommentChange,
    testIdPrefix = 'server-bit',
    padDigits = 2,
    dimUnmapped = true,
    hoverHighlight = true,
    readOnly = false
  }: ServerBitProps): JSX.Element => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(comment ?? '')
    const hasMapped = !!comment?.length

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
      <Box
        data-testid={`${testIdPrefix}-${bitIndex}`}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.75,
          height: 24,
          borderRadius: 1,
          opacity: dimUnmapped && !hasMapped ? 0.35 : 1,
          transition: 'opacity 0.15s',
          '&:hover': {
            opacity: 1,
            ...(hoverHighlight && { backgroundColor: alpha(theme.palette.primary.dark, 0.1) })
          }
        })}
      >
        {/* Toggle circle */}
        <Box
          data-testid={`${testIdPrefix}-circle-${bitIndex}`}
          onClick={readOnly ? undefined : onToggle}
          sx={(theme) => ({
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            cursor: readOnly ? 'default' : 'pointer',
            background: active ? theme.palette.success.main : theme.palette.action.disabled,
            boxShadow: active ? `0 0 5px ${theme.palette.success.main}` : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
            ...(!readOnly && {
              '&:hover': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 }
            })
          })}
        />

        {/* Bit index */}
        <Typography
          variant="caption"
          sx={(theme) => ({
            fontFamily: 'monospace',
            fontWeight: 700,
            color: theme.palette.primary.main,
            lineHeight: 1,
            flexShrink: 0,
            minWidth: 16
          })}
        >
          {String(bitIndex).padStart(padDigits, '0')}
        </Typography>

        {/* Comment — inline editable */}
        {!readOnly && editing ? (
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
            sx={{
              flexGrow: 1,
              minWidth: 0,
              '& input': { fontSize: '0.72rem', py: 0, height: 18 },
              '& .MuiInput-root': { mt: 0 },
              '& .MuiInput-root::before': { borderBottom: 'none' }
            }}
          />
        ) : (
          <Typography
            variant="caption"
            noWrap
            title={comment}
            onClick={
              readOnly
                ? undefined
                : (): void => {
                    setDraft(comment ?? '')
                    setEditing(true)
                  }
            }
            sx={{
              flexGrow: 1,
              minWidth: 0,
              lineHeight: '18px',
              cursor: readOnly ? 'default' : 'text',
              ...(!readOnly && { '&:hover': { textDecoration: 'underline dotted' } })
            }}
          >
            {hasMapped ? comment : '...'}
          </Typography>
        )}
      </Box>
    )
  }
)

export default ServerBit
