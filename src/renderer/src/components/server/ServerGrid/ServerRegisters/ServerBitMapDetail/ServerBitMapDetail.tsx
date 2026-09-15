import Box from '@mui/material/Box'
import { ServerRegisterEntry, BitMapConfig, getBit } from '@shared'
import { pendingRegisterValue, useServerZustand } from '@renderer/context/server.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useRef } from 'react'
import ServerBit from '../../shared/ServerBit'

interface ServerBitMapDetailProps {
  register: ServerRegisterEntry
}

const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

const ServerBitMapDetail = meme(({ register }: ServerBitMapDetailProps): JSX.Element => {
  const { params } = register
  const bitConfig = params.bitMap as BitMapConfig | undefined

  const uuid = useServerZustand((z) => z.selectedUuid)
  const unitId = useServerZustand((z) => z.getUnitId(z.selectedUuid))

  // A toggle sends the word before it with one bit moved, and the store does
  // not hold the word a toggle wrote until main has answered it. So a toggle
  // that arrives inside that round trip reads this instead.
  const wordInFlight = useRef<number | undefined>(undefined)

  const handleToggle = useCallback(
    async (bitIndex: number) => {
      const serverZustand = useServerZustand.getState()
      const currentValue = wordInFlight.current ?? pendingRegisterValue(uuid, unitId, register)
      const newValue = getBit(currentValue, bitIndex)
        ? currentValue & ~(1 << bitIndex)
        : currentValue | (1 << bitIndex)

      wordInFlight.current = newValue
      try {
        await serverZustand.addRegister({
          uuid,
          unitId,
          params: {
            ...params,
            value: newValue,
            min: undefined,
            max: undefined,
            interval: undefined
          }
        })
      } finally {
        // Only the last toggle clears it. An earlier one clearing would hand
        // the next toggle a word that is a toggle behind.
        if (wordInFlight.current === newValue) wordInFlight.current = undefined
      }
    },
    [register, params, uuid, unitId]
  )

  const handleCommentChange = useCallback(
    (bitIndex: number, comment: string | undefined) => {
      const serverZustand = useServerZustand.getState()
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

      serverZustand.addRegister({
        uuid,
        unitId,
        params: {
          ...params,
          bitMap: newBitMap
        }
      })
    },
    [bitConfig, params, uuid, unitId]
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
            onToggle={() => void handleToggle(bitIndex)}
            onCommentChange={(c) => handleCommentChange(bitIndex, c)}
          />
        ))}
      </Box>
    </Box>
  )
})

export default ServerBitMapDetail
