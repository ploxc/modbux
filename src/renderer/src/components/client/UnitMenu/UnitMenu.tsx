import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useCallback, useState } from 'react'
import { showUnit } from './showUnit'

/** Where a right click opened the menu, in the window's pixels. */
export interface MenuPosition {
  left: number
  top: number
}

interface UnitMenuProps {
  /** The client the unit belongs to. */
  uuid: string
  unit: string
  position: MenuPosition | null
  onClose: () => void
  onRename: () => void
  onRenumber: () => void
}

/**
 * What a right click on a unit opens, on its tab and on its row in the client
 * card. Every item first shows the unit, because the store's unit actions act
 * on the unit on screen.
 */
const UnitMenu = meme(({ uuid, unit, position, onClose, onRename, onRenumber }: UnitMenuProps) => {
  const unitCount = useClientZustand((z) => z.clients[uuid]?.units.length ?? 0)
  const [confirming, setConfirming] = useState(false)

  const handleRename = useCallback(() => {
    onClose()
    if (showUnit(uuid, unit)) onRename()
  }, [onClose, onRename, uuid, unit])
  const handleRenumber = useCallback(() => {
    onClose()
    if (showUnit(uuid, unit)) onRenumber()
  }, [onClose, onRenumber, uuid, unit])
  const handleDuplicate = useCallback(() => {
    onClose()
    if (!showUnit(uuid, unit)) return
    const clientZustand = useClientZustand.getState()
    void clientZustand.duplicateUnit(unit)
  }, [onClose, uuid, unit])
  const handleRemove = useCallback(() => {
    onClose()
    setConfirming(true)
  }, [onClose])
  const handleCancel = useCallback(() => setConfirming(false), [])

  return (
    <>
      <Menu
        open={position !== null}
        onClose={onClose}
        anchorReference="anchorPosition"
        anchorPosition={position ?? undefined}
      >
        <MenuItem data-testid={`unit-rename-${unit}`} onClick={handleRename}>
          Rename
        </MenuItem>
        <MenuItem data-testid={`unit-renumber-${unit}`} onClick={handleRenumber}>
          Change unit ID
        </MenuItem>
        <MenuItem data-testid={`unit-duplicate-${unit}`} onClick={handleDuplicate}>
          Duplicate
        </MenuItem>
        <Divider />
        <MenuItem
          data-testid={`unit-remove-${unit}`}
          disabled={unitCount < 2}
          onClick={handleRemove}
          sx={{ color: 'error.light' }}
        >
          Remove
        </MenuItem>
      </Menu>
      {confirming && <ConfirmRemove uuid={uuid} unit={unit} onCancel={handleCancel} />}
    </>
  )
})

interface ConfirmRemoveProps {
  uuid: string
  unit: string
  onCancel: () => void
}

/** Removing a unit drops its mapping and layout, so it is asked first. */
const ConfirmRemove = meme(({ uuid, unit, onCancel }: ConfirmRemoveProps) => {
  const unitId = useClientZustand(
    (z) => z.clients[uuid]?.units.find((found) => found.uuid === unit)?.unitId
  )
  const name = useClientZustand(
    (z) => z.clients[uuid]?.units.find((found) => found.uuid === unit)?.name ?? ''
  )

  const handleConfirm = useCallback(() => {
    onCancel()
    // `removeUnit` takes a unit of the client on screen.
    const clientZustand = useClientZustand.getState()
    clientZustand.setSelectedUuid(uuid)
    if (useClientZustand.getState().selectedUuid !== uuid) return
    void clientZustand.removeUnit(unit)
  }, [onCancel, uuid, unit])

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogHeading icon={<DeleteOutlined />} tone="error">
        Remove unit ID {unitId}
        {name === '' ? '' : ` (${name})`}?
      </DialogHeading>
      <DialogContent>
        <DialogContentText>Its register mapping and layout go with it.</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button data-testid="unit-remove-cancel-btn" variant="text" onClick={onCancel}>
          Keep it
        </Button>
        <Button data-testid="unit-remove-confirm-btn" color="error" onClick={handleConfirm}>
          Remove
        </Button>
      </DialogActions>
    </Dialog>
  )
})

export default UnitMenu
