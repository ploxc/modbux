import ListItemIcon from '@mui/material/ListItemIcon'
import DataObject from '@mui/icons-material/DataObject'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useLiveZustand, dataOf, setOpenRegisterData } from '@renderer/context/live.zustand'
import { useClientZustand, getSelectedUnit } from '@renderer/context/client.zustand'
import { getDummyRegisterData } from '@shared'
import { useCallback } from 'react'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import type { InMenuProps } from './LoadButton'

const LoadDummyDataButton = meme(({ inMenu }: InMenuProps) => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const disabled = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState !== 'disconnected'
  )

  // Dummy rows for the read window of every open panel, so columns can be edited
  // without having to connect to the device or read registers.
  const loadDummy = useCallback(() => {
    inMenu?.()
    const { sections } = getSelectedUnit()
    setOpenRegisterData((type) => {
      const { address, length } = sections[type]
      return Array.from({ length }, (_, offset) => getDummyRegisterData(address + offset))
    })
  }, [inMenu])

  if (inMenu) {
    return (
      <MenuItem disabled={disabled} onClick={loadDummy} data-testid="load-dummy-data-menu-item">
        <ListItemIcon>
          <DataObject fontSize="small" />
        </ListItemIcon>
        Dummy Data
      </MenuItem>
    )
  }

  return (
    <Button
      variant="outlined"
      disabled={disabled}
      size="small"
      onClick={loadDummy}
      data-testid="load-dummy-data-btn"
    >
      Dummy Data
    </Button>
  )
})

export default LoadDummyDataButton
