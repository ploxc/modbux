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
import { FIELD_DEFAULTS, inTimestampWindow, isTimestampType } from './addRegister.zustand.helpers'
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

    // The type comes before the value fields and after `setFixed`, because
    // `setDataType` forces a utf8 or bitmap register fixed and seeds a unix or
    // datetime one with the current time. Set last, it replaced the timestamp
    // the register holds, and `capturePristine` recorded the replacement as what
    // the dialog opened with.
    addRegisterZustand.setDataType(dataType)

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
    } else if (value !== undefined && isTimestampType(dataType)) {
      // The picker works in milliseconds and a unix register stores seconds.
      // `RegisterParamsSchema` bounds no value, so a config file can hold one
      // outside the window, and the field says so rather than the picker having
      // to be touched first.
      const milliseconds = dataType === 'unix' ? Number(value) * 1000 : Number(value)
      addRegisterZustand.setValue(String(milliseconds), inTimestampWindow(dataType, milliseconds))
    } else if (value !== undefined) {
      addRegisterZustand.setValue(String(value), true)
    } else if (!isTimestampType(dataType)) {
      // A generator carries no value. A timestamp keeps the current time
      // `setDataType` seeded, which is the date the picker is showing.
      addRegisterZustand.setValue(FIELD_DEFAULTS.value, true)
    }

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
