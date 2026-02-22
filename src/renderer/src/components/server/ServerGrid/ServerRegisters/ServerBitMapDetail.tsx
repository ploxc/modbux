import { Box, TextField, Typography, alpha } from '@mui/material'
import { ServerRegisterEntry, BitMapConfig, getBit } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect, useState } from 'react'

interface ServerBitMapDetailProps {
  register: ServerRegisterEntry
}

const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

// ─────────────────────────────────────────────────────────────────────────────

interface ServerBitProps {
  bitIndex: number
  active: boolean
  comment: string | undefined
  onToggle: () => void
  onCommentChange: (comment: string | undefined) => void
}

const ServerBit = meme(
  ({ bitIndex, active, comment, onToggle, onCommentChange }: ServerBitProps): JSX.Element => {
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
        data-testid={`server-bit-${bitIndex}`}
        sx={(theme) => ({
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          px: 0.75,
          height: 24,
          borderRadius: 1,
          opacity: hasMapped ? 1 : 0.35,
          transition: 'opacity 0.15s',
          '&:hover': { opacity: 1, backgroundColor: alpha(theme.palette.primary.dark, 0.1) }
        })}
      >
        {/* Toggle circle */}
        <Box
          data-testid={`server-bit-circle-${bitIndex}`}
          onClick={onToggle}
          sx={(theme) => ({
            width: 12,
            height: 12,
            borderRadius: '50%',
            flexShrink: 0,
            cursor: 'pointer',
            background: active ? theme.palette.success.main : theme.palette.action.disabled,
            boxShadow: active ? `0 0 5px ${theme.palette.success.main}` : 'none',
            transition: 'background 0.15s, box-shadow 0.15s',
            '&:hover': { outline: `2px solid ${theme.palette.primary.main}`, outlineOffset: 1 }
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
            flexShrink: 0,
            minWidth: 16
          }}
        >
          {String(bitIndex).padStart(2, '0')}
        </Typography>

        {/* Comment — inline editable */}
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
            onClick={() => {
              setDraft(comment ?? '')
              setEditing(true)
            }}
            sx={{
              flexGrow: 1,
              minWidth: 0,
              lineHeight: 1.2,
              height: 18,
              display: 'flex',
              alignItems: 'center',
              cursor: 'text',
              '&:hover': { textDecoration: 'underline dotted' }
            }}
          >
            {hasMapped ? comment : '...'}
          </Typography>
        )}
      </Box>
    )
  }
)

// ─────────────────────────────────────────────────────────────────────────────

const ServerBitMapDetail = meme(({ register }: ServerBitMapDetailProps): JSX.Element => {
  const { params } = register
  const bitConfig = params.bitMap as BitMapConfig | undefined

  const uuid = useServerZustand((z) => z.selectedUuid)
  const unitId = useServerZustand((z) => z.getUnitId(z.selectedUuid))
  const littleEndian = useServerZustand((z) => z.littleEndian[z.selectedUuid] ?? false)
  const addRegister = useServerZustand((z) => z.addRegister)

  const handleToggle = useCallback(
    (bitIndex: number) => {
      const currentValue = register.value
      const newValue = getBit(currentValue, bitIndex)
        ? currentValue & ~(1 << bitIndex)
        : currentValue | (1 << bitIndex)

      addRegister({
        uuid,
        unitId,
        params: { ...params, value: newValue, min: undefined, max: undefined, interval: undefined },
        littleEndian
      })
    },
    [register.value, params, uuid, unitId, littleEndian, addRegister]
  )

  const handleCommentChange = useCallback(
    (bitIndex: number, comment: string | undefined) => {
      const current = bitConfig ?? {}
      const entry = current[String(bitIndex)] ?? {}
      const updated: BitMapConfig = {
        ...current,
        [String(bitIndex)]: { ...entry, comment }
      }
      // Clean empty entries
      const updatedEntry = updated[String(bitIndex)]
      if (updatedEntry) {
        if (!updatedEntry.comment) delete updatedEntry.comment
        if (Object.keys(updatedEntry).length === 0) delete updated[String(bitIndex)]
      }
      const newBitMap = Object.keys(updated).length > 0 ? updated : undefined

      addRegister({
        uuid,
        unitId,
        params: {
          ...params,
          bitMap: newBitMap
        },
        littleEndian
      })
    },
    [bitConfig, params, uuid, unitId, littleEndian, addRegister]
  )

  return (
    <Box
      data-testid={`server-bitmap-detail-${params.address}`}
      sx={{
        px: 0.5,
        py: 0.5,
        borderTop: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Box
        sx={{
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(8, auto)',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 0
        }}
      >
        {BIT_INDICES.map((bitIndex) => (
          <ServerBit
            key={bitIndex}
            bitIndex={bitIndex}
            active={getBit(register.value, bitIndex)}
            comment={bitConfig?.[String(bitIndex)]?.comment}
            onToggle={() => handleToggle(bitIndex)}
            onCommentChange={(c) => handleCommentChange(bitIndex, c)}
          />
        ))}
      </Box>
    </Box>
  )
})

export default ServerBitMapDetail
