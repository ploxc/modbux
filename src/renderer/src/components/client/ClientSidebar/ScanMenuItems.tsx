import MenuItem from '@mui/material/MenuItem'
import { useScanRegistersZustand } from '@renderer/components/client/ScanRegisters/scanRegisters.zustand'
import { useScanUnitIdZustand } from '@renderer/components/client/ScanUnitIds/scanUnitIds.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { shownType, useClientZustand } from '@renderer/context/client.zustand'
import { dataOf, useLiveZustand } from '@renderer/context/live.zustand'
import { isNumberRegister } from '@shared'
import { useCallback } from 'react'

interface ScanMenuItemProps {
  uuid: string
  /** Closes the menu, so it is not still hanging there when the dialog closes. */
  onClose: () => void
}

/** Opens the unit id scan for the client whose menu it sits in. */
export const ScanUnitIdsMenuItem = meme(({ uuid, onClose }: ScanMenuItemProps) => {
  const disabled = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState !== 'connected')

  const handleOpen = useCallback(() => {
    onClose()
    useScanUnitIdZustand.getState().setOpen(true)
  }, [onClose])

  return (
    <MenuItem disabled={disabled} onClick={handleOpen} data-testid="scan-unitids-btn">
      Scan unit IDs
    </MenuItem>
  )
})

/** Opens the register scan for the type the selected unit shows. */
export const ScanRegistersMenuItem = meme(({ uuid, onClose }: ScanMenuItemProps) => {
  const disabled = useLiveZustand((z) => dataOf(z, uuid).clientState.connectState !== 'connected')
  const registers16Bit = useClientZustand((z) => isNumberRegister(shownType(z)))

  const handleOpen = useCallback(() => {
    onClose()
    useScanRegistersZustand.getState().setOpen(true)
  }, [onClose])

  return (
    <MenuItem disabled={disabled} onClick={handleOpen} data-testid="scan-registers-btn">
      {registers16Bit ? 'Scan registers' : 'Scan TRUE bits'}
    </MenuItem>
  )
})
