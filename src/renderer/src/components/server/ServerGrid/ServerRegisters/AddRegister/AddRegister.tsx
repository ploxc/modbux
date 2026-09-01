import { Box, Modal, Paper, Typography } from '@mui/material'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useEffect } from 'react'
import { FixedOrGenerator, ValueParameters } from './valueParameters'
import { AddressField, DataTypeSelect, CommentField } from './registerFields'
import { AddButtons, DeleteButton } from './addRegisterActions'

const AddRegister = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const registerType = useAddRegisterZustand((z) => z.registerType)
  const setRegisterType = useAddRegisterZustand((z) => z.setRegisterType)
  const setEditRegister = useAddRegisterZustand((z) => z.setEditRegister)

  // Reset to defaults when opening in add mode
  useEffect(() => {
    if (!registerType) return
    if (edit) return
    const state = useAddRegisterZustand.getState()
    state.resetToDefaults()
    state.setRegisterType(registerType)
    state.initNextUnusedAddress()
  }, [registerType, edit])

  // Populate fields when opening in edit mode
  useEffect(() => {
    const state = useAddRegisterZustand.getState()
    if (!state.serverRegisterEdit) return

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
    } = state.serverRegisterEdit.params

    state.setFixed(value !== undefined)
    state.setAddress(String(address))
    state.setRegisterType(registerType)
    state.setComment(comment)
    state.setInterval(interval ? String(interval / 1000) : '1')
    state.setMax(String(max))
    state.setMin(String(min))

    if (dataType === 'utf8') {
      state.setStringValue(stringValue ?? '')
      state.setRegisterLength(String(length ?? 10), true)
      state.setValue('0', true)
    } else if (['unix', 'datetime'].includes(dataType) && value !== undefined) {
      // Convert stored value back to ms for the date picker
      const ms = dataType === 'unix' ? Number(value) * 1000 : Number(value)
      state.setValue(String(ms), true)
    } else {
      state.setValue(String(value))
    }

    state.setDataType(dataType)
  }, [edit])

  return (
    <Modal
      open={!!registerType || !!edit}
      onClose={() => {
        setRegisterType(undefined)
        setEditRegister(undefined)
      }}
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
