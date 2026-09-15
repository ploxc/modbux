/**
 * The dialog's buttons, and the submit they share.
 */
import Button from '@mui/material/Button'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useState } from 'react'
import Delete from '@mui/icons-material/Delete'
import { registerWidth } from '@shared'
import { FIELD_DEFAULTS, isFormDirty, isTimestampType } from './addRegister.zustand.helpers'

export const AddButtons = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const dirty = useAddRegisterZustand((z) => isFormDirty(z, z.pristine))
  const valid = useAddRegisterZustand((z) => {
    if (z.dataType === 'utf8') {
      return z.valid.address && z.valid.stringValue && z.valid.registerLength
    }
    if (['unix', 'datetime'].includes(z.dataType)) {
      // A fixed timestamp comes from the picker, which reports a date outside
      // the window the register can carry the way a mask reports a bad number.
      return z.fixed ? z.valid.address && z.valid.value : z.valid.address && z.valid.interval
    }
    if (z.fixed) return z.valid.address && z.valid.value
    return z.valid.address && z.valid.min && z.valid.max && z.valid.interval
  })

  // A submit waits for main to take the register, and the buttons stay under
  // the pointer while it does. Two presses would both read the dialog before
  // the first answer came back and write the same address twice.
  const [submitting, setSubmitting] = useState(false)

  const handleAddAndClose = useCallback(async () => {
    setSubmitting(true)
    const result = await useAddRegisterZustand.getState().submit(edit)
    setSubmitting(false)
    if (!result) return
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.resetToDefaults()
    addRegisterZustand.setRegisterType(undefined)
  }, [edit])

  const handleAddAndNext = useCallback(async () => {
    setSubmitting(true)
    const result = await useAddRegisterZustand.getState().submit(false)
    setSubmitting(false)
    if (!result) return
    const { address, dataType } = result
    const addRegisterZustand = useAddRegisterZustand.getState()
    const size = registerWidth(dataType, Number(addRegisterZustand.registerLength) || undefined)
    // Reset value and comment, keep dataType/LE/fixed/min/max/interval. A
    // timestamp resets to the current time, the way picking the type seeds it:
    // '0' left the picker showing now over a store holding the epoch, and Add
    // wrote the epoch.
    addRegisterZustand.setValue(
      isTimestampType(dataType) ? String(Date.now()) : FIELD_DEFAULTS.value,
      true
    )
    addRegisterZustand.setComment('')
    if (dataType === 'utf8') addRegisterZustand.setStringValue('')
    addRegisterZustand.initNextUnusedAddress(address + size)
  }, [])

  const handleEditSubmit = useCallback(async () => {
    setSubmitting(true)
    const result = await useAddRegisterZustand.getState().submit(true)
    setSubmitting(false)
    if (!result) return
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setRegisterType(undefined)
    addRegisterZustand.setEditRegister(undefined)
  }, [])

  if (edit) {
    return (
      <Button
        data-testid="add-reg-submit-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        disabled={!valid || !dirty || submitting}
        variant="contained"
        color="primary"
        onClick={handleEditSubmit}
      >
        Submit Change
      </Button>
    )
  }

  return (
    <>
      <Button
        data-testid="add-reg-submit-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        disabled={!valid || submitting}
        variant="contained"
        color="primary"
        onClick={handleAddAndClose}
      >
        Add & Close
      </Button>
      <Button
        data-testid="add-reg-next-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        disabled={!valid || submitting}
        variant="outlined"
        color="primary"
        onClick={handleAddAndNext}
      >
        Add & Next
      </Button>
    </>
  )
})

/**
 * Removes the register being edited.
 *
 * It goes disabled the moment a field is touched, so the two buttons never
 * offer to do different things with what the dialog holds. A user who has
 * typed a new address is moving the register, and Remove there answered for
 * the typed address instead: the register stayed, whatever sat at the typed
 * address went, and the dialog closed as though it had worked.
 */
export const DeleteButton = meme(() => {
  const [over, setOver] = useState(false)
  const dirty = useAddRegisterZustand((z) => isFormDirty(z, z.pristine))

  const handleClick = useCallback(() => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.remove()
    addRegisterZustand.setRegisterType(undefined)
    addRegisterZustand.setEditRegister(undefined)
  }, [])

  return (
    <Button
      data-testid="add-reg-remove-btn"
      sx={{ flex: 1, flexBasis: 0 }}
      disabled={dirty}
      startIcon={<Delete />}
      variant="outlined"
      color={over ? 'error' : 'primary'}
      onClick={handleClick}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
    >
      Remove
    </Button>
  )
})
