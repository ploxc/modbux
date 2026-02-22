import { Box } from '@mui/material'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback } from 'react'
import BitIndicator from './BitIndicator'

interface BitMapDetailPanelProps {
  address: number
}

// Bits are displayed column-major: 0–3 down column 1, 4–7 down column 2, etc.
// This matches natural bit ordering left-to-right, top-to-bottom.
const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

// ─────────────────────────────────────────────────────────────────────────────

const BitMapDetailPanel = meme(({ address }: BitMapDetailPanelProps): JSX.Element => {
  const uint16 = useDataZustand(
    (z) => z.registerData.find((r) => r.id === address)?.words?.uint16 ?? 0
  )

  const setBitComment = useBitMapZustand((z) => z.setBitComment)
  // Select the map entry directly (no ?? {} — that would create a new object every render → infinite loop)
  const bitConfig = useBitMapZustand((z) => z.bitComments[address])

  const registerType = useRootZustand((z) => z.registerConfig.type)
  const writable = registerType === 'holding_registers'
  const connectState = useRootZustand((z) => z.clientState.connectState)
  const polling = useRootZustand((z) => z.clientState.polling)
  const canWrite = writable && connectState === 'connected' && !polling

  const handleToggle = useCallback(
    (bitIndex: number, currentValue: boolean) => {
      if (!canWrite) return
      // Read current value from store to avoid stale closure on rapid toggles
      const currentUint16 =
        useDataZustand.getState().registerData.find((r) => r.id === address)?.words?.uint16 ?? 0
      const newUint16 = currentValue
        ? currentUint16 & ~(1 << bitIndex) // clear bit
        : currentUint16 | (1 << bitIndex) // set bit
      window.api.write({
        address,
        dataType: 'uint16',
        type: 'holding_registers',
        value: newUint16,
        single: true
      })
    },
    [address, canWrite]
  )

  const handleCommentChange = useCallback(
    (bitIndex: number, comment: string | undefined) => {
      setBitComment(address, bitIndex, comment)
      // TODO after merge: z.setRegisterMapping(address, 'bitMap', updatedConfig)
    },
    [address, setBitComment]
  )

  return (
    <Box
      sx={{
        // Container queries: 4 columns when wide, 8 when narrow.
        containerType: 'inline-size',
        px: 0.5,
        py: 0.5,
        borderTop: '1px solid',
        borderColor: 'divider'
      }}
    >
      <Box
        sx={{
          display: 'grid',
          // Column-major: 4 rows × 4 columns → bits 0–3 go down col 1, 4–7 col 2, etc.
          gridAutoFlow: 'column',
          gridTemplateRows: 'repeat(4, auto)',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          // Narrow: 8 rows × 2 columns
          '@container (max-width: 560px)': {
            gridTemplateRows: 'repeat(8, auto)',
            gridTemplateColumns: 'repeat(2, 1fr)'
          }
        }}
      >
        {BIT_INDICES.map((bitIndex) => {
          const value = Boolean((uint16 >> bitIndex) & 1)
          const comment = bitConfig?.[String(bitIndex)]?.comment
          return (
            <BitIndicator
              key={bitIndex}
              bitIndex={bitIndex}
              value={value}
              comment={comment}
              writable={canWrite}
              onToggle={() => handleToggle(bitIndex, value)}
              onCommentChange={(c) => handleCommentChange(bitIndex, c)}
            />
          )
        })}
      </Box>
    </Box>
  )
})

export const BITMAP_DETAIL_HEIGHT = 220 // 4 rows × ~52px card + container padding + border

export default BitMapDetailPanel
