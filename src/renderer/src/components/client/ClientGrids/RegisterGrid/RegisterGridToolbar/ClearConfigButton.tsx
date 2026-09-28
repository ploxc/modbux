import ListItemIcon from '@mui/material/ListItemIcon'
import Delete from '@mui/icons-material/Delete'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import type { InMenuProps } from './LoadButton'
import DialogHeading from '@renderer/components/shared/DialogHeading'
import { meme } from '@renderer/components/shared/inputs/meme'

import { useClientZustand, getSelectedUnit } from '@renderer/context/client.zustand'
import { asOneClientStep } from '@renderer/context/clientUndo'
import { RegisterMapping, RegisterMapValue, RegisterTypeSchema } from '@shared'
import { useCallback, useState } from 'react'

/**
 * Whether the entry holds anything a user would miss.
 *
 * An entry outlives what was in it: the grid writes `comment: ''` when a
 * comment is emptied and `groupEnd: false` when a group end is switched off,
 * and `setRegisterMapping` deletes the register only for a `dataType` of
 * `none`. `RegisterConfig` reads such an entry as nothing configured, so
 * counting keys would raise a dialog over three registers carrying nothing.
 */
const carriesSomething = (value: RegisterMapValue | undefined): boolean =>
  value !== undefined &&
  ((value.dataType !== undefined && value.dataType !== 'none') ||
    value.conversion !== undefined ||
    !!value.comment ||
    value.groupEnd === true ||
    value.bitMap !== undefined)

/** How many addresses the mapping holds something for, over all four types. */
const mappedRegisterCount = (registerMapping: RegisterMapping): number =>
  RegisterTypeSchema.options.reduce(
    (total, type) => total + Object.values(registerMapping[type]).filter(carriesSomething).length,
    0
  )

const clearConfiguration = (): void => {
  const clientZustand = useClientZustand.getState()
  void asOneClientStep(async () => {
    clientZustand.setUnitName('')
    await clientZustand.clearRegisterMapping()
  })
}

interface ConfirmProps {
  mapped: number
  named: boolean
  onCancel: () => void
}

/**
 * What one click was throwing away, before it does.
 *
 * The button sits beside Save and drops the data type, scaling factor, comment,
 * group end and bitmap of every mapped address, which is the work a config file
 * is made of. The two dialogs Modbux already has ask about a system setting;
 * this is the first that guards what the user made.
 */
const ConfirmClear = meme(({ mapped, named, onCancel }: ConfirmProps): JSX.Element => {
  const handleConfirm = useCallback(() => {
    clearConfiguration()
    onCancel()
  }, [onCancel])

  return (
    <Dialog open onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogHeading icon={<DeleteOutlined />} tone="error">
        Clear the register configuration?
      </DialogHeading>
      <DialogContent>
        <DialogContentText>
          {mapped > 0 && (
            <>
              {mapped} {mapped === 1 ? 'register carries' : 'registers carry'} a data type, a
              scaling factor, a comment, a group end or a bitmap.{' '}
            </>
          )}
          {named && <>The configuration name goes too. </>}
          Clearing drops all of it, and turns read configuration off.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button data-testid="clear-config-cancel-btn" variant="text" onClick={onCancel}>
          Keep it
        </Button>
        <Button data-testid="clear-config-confirm-btn" color="error" onClick={handleConfirm}>
          Clear
        </Button>
      </DialogActions>
    </Dialog>
  )
})

const ClearConfigButton = meme(({ inMenu }: InMenuProps): JSX.Element => {
  const [warn, setWarn] = useState(false)
  const [asking, setAsking] = useState<{ mapped: number; named: boolean } | undefined>(undefined)

  // Read on the click rather than through a selector: the mapping is four
  // records of up to 65536 addresses, and a selector reading them runs on every
  // flush of a store that takes a transaction per request.
  const handleClick = useCallback(() => {
    const mapped = mappedRegisterCount(getSelectedUnit().registerMapping)
    const named = getSelectedUnit().name !== ''

    // The name is typed by hand and goes with the mapping, so a configuration
    // holding only a name is one to ask about too.
    if (mapped === 0 && !named) {
      clearConfiguration()
      inMenu?.()
      return
    }
    setAsking({ mapped, named })
  }, [inMenu])

  // In the menu, the dialog lives in the item, so the menu closes after it.
  const handleCancel = useCallback(() => {
    setAsking(undefined)
    inMenu?.()
  }, [inMenu])

  const dialog = asking && (
    <ConfirmClear mapped={asking.mapped} named={asking.named} onCancel={handleCancel} />
  )

  if (inMenu) {
    return (
      <>
        <MenuItem onClick={handleClick} data-testid="clear-config-menu-item">
          <ListItemIcon>
            <Delete fontSize="small" />
          </ListItemIcon>
          Clear configuration
        </MenuItem>
        {dialog}
      </>
    )
  }

  return (
    <>
      <IconButton
        data-testid="clear-config-btn"
        aria-label="Clear configuration"
        size="small"
        onClick={handleClick}
        color={warn ? 'error' : 'primary'}
        title="clear datatype, scaling and comment configuration"
        onMouseEnter={() => setWarn(true)}
        onMouseLeave={() => setWarn(false)}
      >
        <Delete fontSize="small" />
      </IconButton>
      {dialog}
    </>
  )
})

export default ClearConfigButton
