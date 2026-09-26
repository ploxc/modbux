import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { meme } from '@renderer/components/shared/inputs/meme'
import { selectedClient, shownType, useClientZustand } from '@renderer/context/client.zustand'
import { useCallback, useMemo } from 'react'
import { isNumberRegister } from '@shared'

type BitWidth = '32' | '64'

/** The 32 bit columns and the 64 bit columns, each on or off by itself. */
const BitWidthButtons = meme((): JSX.Element | null => {
  const type = useClientZustand((z) => shownType(z))
  const show32 = useClientZustand((z) => selectedClient(z).registerConfig.advancedMode)
  const show64 = useClientZustand((z) => selectedClient(z).registerConfig.show64BitValues)

  const value = useMemo(
    () => [...(show32 ? ['32'] : []), ...(show64 ? ['64'] : [])],
    [show32, show64]
  )

  const handleChange = useCallback(
    (_event: unknown, next: BitWidth[]): void => {
      const clientZustand = useClientZustand.getState()
      if (next.includes('32') !== show32) clientZustand.setAdvancedMode(!show32)
      if (next.includes('64') !== show64) clientZustand.setShow64BitValues(!show64)
    },
    [show32, show64]
  )

  if (!isNumberRegister(type)) return null

  return (
    <ToggleButtonGroup
      size="small"
      color="primary"
      value={value}
      onChange={handleChange}
      aria-label="Show 32 and 64 bit values"
    >
      <ToggleButton value="32" data-testid="bits-32-btn" aria-label="Show 32 bit values">
        32
      </ToggleButton>
      <ToggleButton value="64" data-testid="bits-64-btn" aria-label="Show 64 bit values">
        64
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

export default BitWidthButtons
