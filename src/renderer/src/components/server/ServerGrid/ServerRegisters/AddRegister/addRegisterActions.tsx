/**
 * The dialog's buttons, and the submit they share.
 */
import { Button } from '@mui/material'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { useCallback, useState } from 'react'
import { AddRegisterParams, BaseDataType, RegisterParamsBasePart } from '@shared'
import { useServerZustand } from '@renderer/context/server.zustand'
import { Delete } from '@mui/icons-material'

function submitRegister(isEdit: boolean): { address: number; dataType: BaseDataType } | undefined {
  const {
    fixed,
    address,
    value,
    dataType,
    registerType,
    min,
    max,
    interval,
    comment,
    stringValue,
    registerLength,
    serverRegisterEdit
  } = useAddRegisterZustand.getState()
  if (!registerType) return undefined

  const z = useServerZustand.getState()
  const uuid = z.selectedUuid
  const unitId = z.getUnitId(uuid)

  const littleEndian = z.littleEndian[uuid] ?? false
  const commonParams: Omit<AddRegisterParams, 'params'> = { uuid, unitId, littleEndian }
  const baseRegisterParams: RegisterParamsBasePart = {
    address: Number(address),
    dataType,
    comment,
    registerType
  }

  if (isEdit && serverRegisterEdit) {
    const oldAddress = serverRegisterEdit.params.address
    if (oldAddress !== Number(address)) {
      z.removeRegister({
        uuid,
        unitId,
        address: oldAddress,
        registerType,
        dataType: serverRegisterEdit.params.dataType
      })
    }
  }

  if (dataType === 'utf8') {
    // UTF-8: always fixed, pass stringValue and length
    z.addRegister({
      ...commonParams,
      params: {
        ...baseRegisterParams,
        value: 0,
        stringValue,
        length: Number(registerLength) || 10
      }
    })
  } else if (['unix', 'datetime'].includes(dataType)) {
    if (fixed) {
      // Fixed timestamp from date picker (value stored as ms)
      const timestamp = dataType === 'unix' ? Math.floor(Number(value) / 1000) : Number(value)
      z.addRegister({ ...commonParams, params: { ...baseRegisterParams, value: timestamp } })
    } else {
      // Generator: system time, only interval matters
      z.addRegister({
        ...commonParams,
        params: {
          ...baseRegisterParams,
          min: 0,
          max: 0,
          interval: Number(interval) * 1000
        }
      })
    }
  } else if (fixed) {
    z.addRegister({ ...commonParams, params: { ...baseRegisterParams, value: Number(value) } })
  } else {
    z.addRegister({
      ...commonParams,
      params: {
        ...baseRegisterParams,
        min: Number(min),
        max: Number(max),
        interval: Number(interval) * 1000
      }
    })
  }

  return { address: Number(address), dataType }
}

// Add buttons

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
    const result = submitRegister(edit)
    if (!result) return
    const state = useAddRegisterZustand.getState()
    state.resetToDefaults()
    state.setRegisterType(undefined)
  }, [edit])

  const handleAddAndNext = useCallback(() => {
    const result = submitRegister(false)
    if (!result) return
    const { address, dataType } = result
    const state = useAddRegisterZustand.getState()
    const size = ['double', 'uint64', 'int64', 'datetime'].includes(dataType)
      ? 4
      : ['uint32', 'int32', 'float', 'unix'].includes(dataType)
        ? 2
        : dataType === 'utf8'
          ? Number(state.registerLength) || 10
          : 1
    // Reset value and comment, keep dataType/LE/fixed/min/max/interval
    state.setValue('0', true)
    state.setComment('')
    if (dataType === 'utf8') state.setStringValue('')
    state.initNextUnusedAddress(address + size)
  }, [])

  const handleEditSubmit = useCallback(() => {
    const result = submitRegister(true)
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

//
//
//
//
// MAIN
