import Box from '@mui/material/Box'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useEffect } from 'react'
import { FixedOrGenerator, ValueParameters } from './valueParameters'
import { AddressField, DataTypeSelect, CommentField } from './registerFields'
import { AddButtons, DeleteButton } from './addRegisterActions'
import { FIELD_DEFAULTS } from './addRegister.zustand.helpers'
import { DEFAULT_UTF8_LENGTH } from '@shared'

const AddRegister = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const registerType = useAddRegisterZustand((z) => z.registerType)

  const handleClose = useCallback((): void => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.setRegisterType(undefined)
    addRegisterZustand.setEditRegister(undefined)
  }, [])

  // Reset to defaults when opening in add mode
  useEffect(() => {
    if (!registerType) return
    if (edit) return
    const addRegisterZustand = useAddRegisterZustand.getState()
    addRegisterZustand.resetToDefaults()
    addRegisterZustand.setRegisterType(registerType)
    addRegisterZustand.initNextUnusedAddress()
  }, [registerType, edit])

  // Populate fields when opening in edit mode
  useEffect(() => {
    const addRegisterZustand = useAddRegisterZustand.getState()
    if (!addRegisterZustand.serverRegisterEdit) return

    const {
      address,
      comment,
      dataType,
      registerType,
      interval,
      max,
      min,
      value,
      stringValue,
      length
    } = addRegisterZustand.serverRegisterEdit.params

    // The masked setters take the validity of what they are given as a second
    // argument, and a stored register holds values that were valid when it was
    // added. Left off, a field came up marked wrong, and only a field on screen
    // had that corrected, by the mask under it reporting back on mount.
    addRegisterZustand.setFixed(value !== undefined)
    addRegisterZustand.setAddress(String(address), true)
    addRegisterZustand.setRegisterType(registerType)
    addRegisterZustand.setComment(comment)
    addRegisterZustand.setInterval(
      interval ? String(interval / 1000) : FIELD_DEFAULTS.interval,
      true
    )
    addRegisterZustand.setMax(max === undefined ? FIELD_DEFAULTS.max : String(max), true)
    addRegisterZustand.setMin(min === undefined ? FIELD_DEFAULTS.min : String(min), true)

    if (dataType === 'utf8') {
      addRegisterZustand.setStringValue(stringValue ?? '')
      addRegisterZustand.setRegisterLength(String(length ?? DEFAULT_UTF8_LENGTH), true)
      addRegisterZustand.setValue(FIELD_DEFAULTS.value, true)
    } else if (['unix', 'datetime'].includes(dataType) && value !== undefined) {
      // Convert stored value back to ms for the date picker
      const ms = dataType === 'unix' ? Number(value) * 1000 : Number(value)
      addRegisterZustand.setValue(String(ms), true)
    } else {
      addRegisterZustand.setValue(value === undefined ? FIELD_DEFAULTS.value : String(value), true)
    }

    addRegisterZustand.setDataType(dataType)

    // The fields are set, so this records what the dialog opened with. The
    // buttons compare against it to know whether anything has been typed.
    addRegisterZustand.capturePristine()
  }, [edit])

  return (
    <Modal
      open={!!registerType || !!edit}
      onClose={handleClose}
      sx={{
        display: 'flex',
        justifyContent: 'center',
        pt: 2,
        px: 2,
        alignItems: 'center'
      }}
      slotProps={{ backdrop: { sx: { background: 'rgba(0,0,0,0.25)' } } }}
    >
      <Paper
        elevation={5}
        sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, height: 'fit-content' }}
      >
        <Typography variant="subtitle2" sx={{ px: 0.5 }}>
          {edit ? 'Edit' : 'Add'}{' '}
          {registerType === 'input_registers' ? 'Input Register' : 'Holding Register'}
        </Typography>
        <FixedOrGenerator />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <AddressField />
          <DataTypeSelect />
          <ValueParameters />
        </Box>
        <CommentField />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <AddButtons />
          {edit && <DeleteButton />}
        </Box>
      </Paper>
    </Modal>
  )
})

export default AddRegister
