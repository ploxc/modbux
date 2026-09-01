/**
 * The dialog's buttons, and the submit they share.
 */
import Button from '@mui/material/Button'
import { useAddRegisterZustand } from './addRegister.zustand'
import { getRegisterSize } from './addRegister.zustand.helpers'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useState } from 'react'
import { useServerZustand } from '@renderer/context/server.zustand'
import Delete from '@mui/icons-material/Delete'

export const AddButtons = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const valid = useAddRegisterZustand((z) => {
    if (z.dataType === 'utf8') {
      return z.valid.address && z.valid.stringValue && z.valid.registerLength
    }
    if (['unix', 'datetime'].includes(z.dataType)) {
      return z.fixed ? z.valid.address : z.valid.address && z.valid.interval
    }
    if (z.fixed) return z.valid.address && z.valid.value
    return z.valid.address && z.valid.min && z.valid.max && z.valid.interval
  })

  const handleAddAndClose = useCallback(() => {
    const result = useAddRegisterZustand.getState().submit(edit)
    if (!result) return
    const state = useAddRegisterZustand.getState()
    state.resetToDefaults()
    state.setRegisterType(undefined)
  }, [edit])

  const handleAddAndNext = useCallback(() => {
    const result = useAddRegisterZustand.getState().submit(false)
    if (!result) return
    const { address, dataType } = result
    const state = useAddRegisterZustand.getState()
    const size = getRegisterSize(dataType, Number(state.registerLength) || 10)
    // Reset value and comment, keep dataType/LE/fixed/min/max/interval
    state.setValue('0', true)
    state.setComment('')
    if (dataType === 'utf8') state.setStringValue('')
    state.initNextUnusedAddress(address + size)
  }, [])

  const handleEditSubmit = useCallback(() => {
    const result = useAddRegisterZustand.getState().submit(true)
    if (!result) return
    const state = useAddRegisterZustand.getState()
    state.setRegisterType(undefined)
    state.setEditRegister(undefined)
  }, [])

  if (edit) {
    return (
      <Button
        data-testid="add-reg-submit-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        disabled={!valid}
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
        disabled={!valid}
        variant="contained"
        color="primary"
        onClick={handleAddAndClose}
      >
        Add & Close
      </Button>
      <Button
        data-testid="add-reg-next-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        disabled={!valid}
        variant="outlined"
        color="primary"
        onClick={handleAddAndNext}
      >
        Add & Next
      </Button>
    </>
  )
})

export const DeleteButton = meme(() => {
  const [over, setOver] = useState(false)
  const handleClick = useCallback(() => {
    const { address, registerType, setRegisterType, setEditRegister } =
      useAddRegisterZustand.getState()
    if (!registerType) return

    const z = useServerZustand.getState()
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)

    const numericAddress = Number(address)
    const entry = z.serverRegisters[uuid]?.[unitId]?.[registerType]?.[numericAddress]
    const dataType = entry?.params?.dataType ?? 'uint16'

    z.removeRegister({
      uuid,
      unitId,
      address: numericAddress,
      registerType,
      dataType
    })

    setRegisterType(undefined)
    setEditRegister(undefined)
  }, [])

  return (
    <Button
      data-testid="add-reg-remove-btn"
      sx={{ flex: 1, flexBasis: 0 }}
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
