import { Box } from '@mui/material'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useBitMapZustand } from '@renderer/context/bitmap.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { useCallback } from 'react'
import BitIndicator from './BitIndicator'

interface BitMapDetailPanelProps {
  address: number
}

// Bits are displayed MSB→LSB (bit 15 top-left, bit 0 bottom-right),
// matching the binary column convention in the grid.
const BIT_INDICES = Array.from({ length: 16 }, (_, i) => 15 - i)

// ─────────────────────────────────────────────────────────────────────────────

const BitMapDetailPanel = ({ address }: BitMapDetailPanelProps): JSX.Element => {
  const row = useDataZustand((z) => z.registerData.find((r) => r.id === address))
  const uint16 = row?.words?.uint16 ?? 0

  const setBitComment = useBitMapZustand((z) => z.setBitComment)
  const getBitConfig = useBitMapZustand((z) => z.getBitConfig)
  const bitConfig = getBitConfig(address)

  const registerType = useRootZustand((z) => z.registerConfig.type)
  const writable = registerType === 'holding_registers'
  const connectState = useRootZustand((z) => z.clientState.connectState)
  const polling = useRootZustand((z) => z.clientState.polling)
  const canWrite = writable && connectState === 'connected' && !polling

  const handleToggle = useCallback(
    (bitIndex: number, currentValue: boolean) => {
      if (!canWrite) return
      const newUint16 = currentValue
        ? uint16 & ~(1 << bitIndex) // clear bit
        : uint16 | (1 << bitIndex) // set bit
      window.api.write({
        address,
        dataType: 'uint16',
        type: 'holding_registers',
        value: newUint16,
        single: true
      })
    },
    [address, canWrite, uint16]
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
          // 4 columns default (wide)
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0,
          // Narrow: 8 columns  (≤ ~560px container width)
          '@container (max-width: 560px)': {
            gridTemplateColumns: 'repeat(8, 1fr)'
          }
        }}
      >
        {BIT_INDICES.map((bitIndex) => {
          const value = Boolean((uint16 >> bitIndex) & 1)
          const comment = bitConfig[String(bitIndex)]?.comment
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
}

export const BITMAP_DETAIL_HEIGHT = 148 // 4 rows × ~30px + padding + border

export default BitMapDetailPanel
