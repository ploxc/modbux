import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { meme } from '@renderer/components/shared/inputs/meme'
import type { MenuPosition } from '@renderer/components/client/UnitMenu/UnitMenu'
import {
  openTypesOf,
  readsNothingIn,
  selectedUnit,
  useClientZustand
} from '@renderer/context/client.zustand'
import { dataOf, sectionOf, useLiveZustand } from '@renderer/context/live.zustand'
import { clientOwner, RegisterType } from '@shared'
import { useCallback } from 'react'

interface SectionMenuProps {
  type: RegisterType
  position: MenuPosition | null
  onClose: () => void
}

/** What a right click on a section's head opens: Read, Clear and Hide of this section alone. */
const SectionMenu = meme(({ type, position, onClose }: SectionMenuProps) => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  const several = useClientZustand((z) => openTypesOf(z).length > 1)
  const connected = useLiveZustand(
    (z) => dataOf(z, selectedUuid).clientState.connectState === 'connected'
  )
  const owner = useLiveZustand((z) => clientOwner(dataOf(z, selectedUuid).clientState))
  const polling = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.polling)
  const readsNoRegisters = useClientZustand((z) => readsNothingIn(z, z.selectedUuid, type))
  const noRows = useLiveZustand(
    (z) => sectionOf(z, selectedUuid, unit, type).registerData.length === 0
  )

  const handleRead = useCallback(() => {
    onClose()
    const clientZustand = useClientZustand.getState()
    window.api.read({
      uuid: clientZustand.selectedUuid,
      unit: selectedUnit(clientZustand).uuid,
      type
    })
  }, [onClose, type])
  const handleClear = useCallback(() => {
    onClose()
    const clientZustand = useClientZustand.getState()
    useLiveZustand
      .getState()
      .setRegisterData(clientZustand.selectedUuid, selectedUnit(clientZustand).uuid, type, [])
  }, [onClose, type])
  const handleHide = useCallback(() => {
    onClose()
    const clientZustand = useClientZustand.getState()
    clientZustand.setType(type)
  }, [onClose, type])

  return (
    <Menu
      open={position !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={position ?? undefined}
    >
      <MenuItem
        data-testid={`section-menu-read-${type}`}
        disabled={!connected || owner !== undefined || readsNoRegisters}
        onClick={handleRead}
      >
        Read
      </MenuItem>
      <MenuItem
        data-testid={`section-menu-clear-${type}`}
        disabled={noRows || polling}
        onClick={handleClear}
      >
        Clear
      </MenuItem>
      <Divider />
      <MenuItem data-testid={`section-menu-hide-${type}`} disabled={!several} onClick={handleHide}>
        Hide
      </MenuItem>
    </Menu>
  )
})

export default SectionMenu
