import Box from '@mui/material/Box'
import { useDataZustand } from '@renderer/context/data.zustand'
import { selectedClientUuid, useClientZustand } from '@renderer/context/client.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback } from 'react'
import { BitColor, BitMapConfig } from '@shared'
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

  const bitConfig = useClientZustand(
    (z) => z.registerMapping[z.registerConfig.type][address]?.bitMap
  )

  const registerType = useClientZustand((z) => z.registerConfig.type)
  const writable = registerType === 'holding_registers'
  const connectState = useDataZustand((z) => z.clientState.connectState)
  const polling = useDataZustand((z) => z.clientState.polling)

  // Main refuses a write while one is in flight, and holds it until the read
  // back is in. Sixteen toggles one click apart are what that refusal is for,
  // so the bits go inert for that stretch instead.
  const writing = useDataZustand((z) => z.clientState.writing)
  const canWrite = writable && connectState === 'connected' && !polling && !writing

  const handleToggle = useCallback(
    (bitIndex: number, currentValue: boolean) => {
      if (!canWrite) return
      const currentUint16 =
        useDataZustand.getState().registerData.find((r) => r.id === address)?.words?.uint16 ?? 0
      const newUint16 = currentValue
        ? currentUint16 & ~(1 << bitIndex) // clear bit
        : currentUint16 | (1 << bitIndex) // set bit
      window.api.write({
        uuid: selectedClientUuid(),
        parameters: {
          address,
          dataType: 'uint16',
          type: 'holding_registers',
          value: newUint16,
          single: true
        }
      })
    },
    [address, canWrite]
  )

  // Every one of these takes the bit it is about, because `BitIndicator` is
  // `meme`'d and `deepEqual` compares a function by identity: sixteen arrows
  // built in this file's JSX are sixteen new ones per render. Measured in
  // `__tests__/BitMapDetailPanel.test.tsx`: a poll that flipped one bit redrew
  // all sixteen indicators, and redraws the one now.
  const updateBitMap = useCallback(
    (bitIndex: number, patch: Record<string, unknown>) => {
      const clientZustand = useClientZustand.getState()
      const current = bitConfig ?? {}
      const entry = current[String(bitIndex)] ?? {}
      const updated: BitMapConfig = {
        ...current,
        [String(bitIndex)]: { ...entry, ...patch }
      }
      // Clean undefined values from the entry
      const updatedEntry = updated[String(bitIndex)]
      if (updatedEntry) {
        if (!updatedEntry.comment) delete updatedEntry.comment
        if (!updatedEntry.color || updatedEntry.color === 'default') delete updatedEntry.color
        if (!updatedEntry.invert) delete updatedEntry.invert
        // Remove entry entirely if empty
        if (Object.keys(updatedEntry).length === 0) delete updated[String(bitIndex)]
      }
      clientZustand.setRegisterMapping(
        address,
        'bitMap',
        Object.keys(updated).length > 0 ? updated : undefined
      )
    },
    [address, bitConfig]
  )

  const handleCommentChange = useCallback(
    (bitIndex: number, comment: string | undefined) => {
      updateBitMap(bitIndex, { comment })
    },
    [updateBitMap]
  )

  const handleColorChange = useCallback(
    (bitIndex: number, color: BitColor | undefined) => {
      updateBitMap(bitIndex, { color })
    },
    [updateBitMap]
  )

  const handleInvertChange = useCallback(
    (bitIndex: number, invert: boolean) => {
      updateBitMap(bitIndex, { invert: invert || undefined })
    },
    [updateBitMap]
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
          const entry = bitConfig?.[String(bitIndex)]
          return (
            <BitIndicator
              key={bitIndex}
              bitIndex={bitIndex}
              value={value}
              comment={entry?.comment}
              color={entry?.color}
              invert={entry?.invert}
              writable={canWrite}
              onToggle={handleToggle}
              onCommentChange={handleCommentChange}
              onColorChange={handleColorChange}
              onInvertChange={handleInvertChange}
            />
          )
        })}
      </Box>
    </Box>
  )
})

export default BitMapDetailPanel
