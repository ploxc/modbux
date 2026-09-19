import SettingsOutlined from '@mui/icons-material/SettingsOutlined'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Theme } from '@mui/material/styles'
import { alpha } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useState } from 'react'
import { BitColor } from '@shared'
import BitSettingsPopover from './BitSettingsPopover'

interface BitIndicatorProps {
  bitIndex: number
  value: boolean
  comment: string | undefined
  color: BitColor | undefined
  invert: boolean | undefined
  writable: boolean
  /**
   * Each of these takes the bit it is about, so the panel hands over one
   * `useCallback` rather than sixteen fresh arrows. `meme` is `memo` with
   * `deepEqual`, which compares functions by identity, so an arrow built in the
   * panel's JSX re-rendered all sixteen indicators on every poll that changed a
   * word. `ServerBoolRow` is the same shape.
   */
  onToggle: (bitIndex: number, value: boolean) => void
  onCommentChange: (bitIndex: number, comment: string | undefined) => void
  onColorChange: (bitIndex: number, color: BitColor | undefined) => void
  onInvertChange: (bitIndex: number, invert: boolean) => void
}

const resolveColor = (c: BitColor | undefined, theme: Theme): string => {
  if (c === 'warning') return theme.palette.warning.main
  if (c === 'error') return theme.palette.error.main
  return theme.palette.success.main
}

const BitIndicator = meme(
  ({
    bitIndex,
    value,
    comment,
    color,
    invert,
    writable,
    onToggle,
    onCommentChange,
    onColorChange,
    onInvertChange
  }: BitIndicatorProps): JSX.Element => {
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(comment ?? '')
    const hasMapped = !!comment?.length
    const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null)

    const displayValue = invert ? !value : value

    // Keep draft in sync when comment changes externally
    useEffect(() => {
      if (!editing) setDraft(comment ?? '')
    }, [comment, editing])

    const commit = useCallback(
      (text: string) => {
        setEditing(false)
        onCommentChange(bitIndex, text.trim() || undefined)
      },
      [bitIndex, onCommentChange]
    )

    // What the panel hands over is about a bit; what goes to the circle and to
    // the popover is about this one. Both ends are stable, so a poll that
    // changes one word renders the indicator it belongs to.
    const handleToggle = useCallback(() => onToggle(bitIndex, value), [bitIndex, onToggle, value])

    const handleColorChange = useCallback(
      (color: BitColor | undefined) => onColorChange(bitIndex, color),
      [bitIndex, onColorChange]
    )

    const handleInvertChange = useCallback(
      (invert: boolean) => onInvertChange(bitIndex, invert),
      [bitIndex, onInvertChange]
    )

    return (
      <Paper
        data-testid={`bit-indicator-${bitIndex}`}
        variant="outlined"
        sx={(theme) => {
          const activeColor = resolveColor(color, theme)
          return {
            px: 1,
            py: 0.75,
            m: 0.375,
            maxHeight: 25,
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            opacity: hasMapped ? 1 : 0.25,
            borderColor: displayValue ? activeColor : undefined,
            bgcolor: displayValue ? alpha(activeColor, 0.07) : undefined,
            transition: 'border-color 0.15s, background-color 0.15s, opacity 0.15s',
            '&:hover': { opacity: 1 },
            overflow: 'hidden'
          }
        }}
      >
        {/* Circle toggle — shows RAW value; uses primary when inverted so it's independent of signal color */}
        <Box
          data-testid={`bit-circle-${bitIndex}`}
          onClick={writable ? handleToggle : undefined}
          sx={(theme) => {
            const circleColor = invert ? theme.palette.primary.main : resolveColor(color, theme)
            return {
              width: 12,
              height: 12,
              borderRadius: '50%',
              flexShrink: 0,
              background: value ? circleColor : theme.palette.action.disabled,
              boxShadow: value ? `0 0 5px ${circleColor}` : 'none',
              transition: 'background 0.15s, box-shadow 0.15s',
              cursor: writable ? 'pointer' : 'default',
              '&:hover': writable
                ? { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 }
                : {}
            }
          }}
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
            data-testid={`bit-comment-${bitIndex}`}
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

        {/* Settings cog */}
        <SettingsOutlined
          data-testid={`bit-settings-${bitIndex}`}
          sx={{
            fontSize: 14,
            cursor: 'pointer',
            opacity: 0.4,
            flexShrink: 0,
            '&:hover': { opacity: 1 },
            transition: 'opacity 0.15s'
          }}
          onClick={(e) => setSettingsAnchor(e.currentTarget as unknown as HTMLElement)}
        />

        <BitSettingsPopover
          anchorEl={settingsAnchor}
          onClose={() => setSettingsAnchor(null)}
          color={color}
          invert={!!invert}
          onColorChange={handleColorChange}
          onInvertChange={handleInvertChange}
        />
      </Paper>
    )
  }
)

export default BitIndicator
