import ClearAll from '@mui/icons-material/ClearAll'
import ListItemIcon from '@mui/material/ListItemIcon'
import MenuItem from '@mui/material/MenuItem'
import type { InMenuProps } from './LoadButton'
import Button from '@mui/material/Button'
import { meme } from '@renderer/components/shared/inputs/meme'
import {
  useLiveZustand,
  dataOf,
  sectionOf,
  setOpenRegisterData
} from '@renderer/context/live.zustand'
import { useCallback, useMemo } from 'react'
import { RegisterType } from '@shared'
import { useClientZustand, selectedUnit, openTypesOf } from '@renderer/context/client.zustand'

const ClearButton = meme(({ inMenu }: InMenuProps): JSX.Element => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const openList = useClientZustand((z) => openTypesOf(z).join(','))
  const openTypes = useMemo(() => openList.split(',') as RegisterType[], [openList])
  const noData = useLiveZustand((z) =>
    openTypes.every((type) => sectionOf(z, selectedUuid, unit, type).registerData.length === 0)
  )
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const disabled = noData || polling

  // Every open panel, not only the one last read.
  const handleClear = useCallback((): void => {
    inMenu?.()
    setOpenRegisterData(() => [])
  }, [inMenu])

  if (inMenu) {
    return (
      <MenuItem disabled={disabled} onClick={handleClear} data-testid="clear-data-menu-item">
        <ListItemIcon>
          <ClearAll fontSize="small" />
        </ListItemIcon>
        Clear
      </MenuItem>
    )
  }

  return (
    <Button
      data-testid="clear-data-btn"
      disabled={disabled}
      size="small"
      variant="outlined"
      onClick={handleClear}
    >
      Clear
    </Button>
  )
})

export default ClearButton
