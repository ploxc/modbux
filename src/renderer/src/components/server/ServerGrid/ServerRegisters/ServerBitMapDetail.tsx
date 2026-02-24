import { Box } from '@mui/material'
import { ServerRegisterEntry, BitMapConfig, getBit } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback } from 'react'
import ServerBit from '../shared/ServerBit'

interface ServerBitMapDetailProps {
  register: ServerRegisterEntry
}

const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

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
