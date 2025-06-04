import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputBaseComponentProps,
  Modal,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material'
import { useAddRegisterZustand } from './addRegister.zustand'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { ElementType, forwardRef, useCallback, useEffect, useState } from 'react'
import { IMask, IMaskInput } from 'react-imask'
import { AddRegisterParams, notEmpty, RegisterParamsBasePart } from '@shared'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { useMinMaxInteger } from '@renderer/hooks'
import { useServerZustand } from '@renderer/context/server.zustand'
import { Delete } from '@mui/icons-material'

//
//
//
//
// Address
const AddressInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  // Set maximum address based on data type
  const maxAddress = useAddRegisterZustand((z) => {
    if (['int32', 'uint32', 'float'].includes(z.dataType)) return 65534
    if (['int64', 'uint64', 'double'].includes(z.dataType)) return 65532
    return 65535
  })

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={0}
      max={maxAddress}
      autofix
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

AddressInputForward.displayName = 'AddressInput'
const AddressInput = meme(AddressInputForward)

const AddressField = meme(() => {
  const address = useAddRegisterZustand((z) => String(z.address))
  const addressInUse = useAddRegisterZustand((z) => z.addressInUse)
  const addressFitError = useAddRegisterZustand((z) => z.addressFitError)
  const valid = useAddRegisterZustand((z) => z.valid.address)
  const setAddress = useAddRegisterZustand((z) => z.setAddress)

  useEffect(() => {
    const edit = useAddRegisterZustand.getState().serverRegisterEdit !== undefined
    if (edit) return
    useAddRegisterZustand.getState().initFirstUnusedAddress()
  }, [])

  return (
    <FormControl error={!valid}>
      <TextField
        error={!valid}
        label="Address"
        variant="outlined"
        size="small"
        sx={{ width: 90 }}
        value={address}
        slotProps={{
          input: {
            inputComponent: AddressInput as unknown as ElementType<
              InputBaseComponentProps,
              'input'
            >,
            inputProps: maskInputProps({ set: setAddress })
          }
        }}
      />
      {addressInUse && <FormHelperText>In use</FormHelperText>}
      {addressFitError && <FormHelperText>Data type does not fit at this address</FormHelperText>}
    </FormControl>
  )
})

//
//
//
//
// Data Type
const DataTypeSelect = meme(() => {
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const setDataType = useAddRegisterZustand((z) => z.setDataType)
  useEffect(() => {
    const edit = useAddRegisterZustand.getState().serverRegisterEdit !== undefined
    if (edit) return
    useAddRegisterZustand.getState().setDataType('int16')
  }, [])
  return <DataTypeSelectInput dataType={dataType} setDataType={setDataType} />
})

//
//
//
//
// Fixed Or Generator
const FixedOrGenerator = meme(() => {
  const fixed = useAddRegisterZustand((z) => z.fixed)
  const setFixed = useAddRegisterZustand((z) => z.setFixed)

  useEffect(() => {
    const edit = useAddRegisterZustand.getState().serverRegisterEdit !== undefined
    if (edit) return
    // Default fixed
    setFixed(true)
  }, [setFixed])

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={fixed}
      onChange={(_, v) => v !== null && setFixed(v)}
      sx={{ flex: 1 }}
    >
      <ToggleButton sx={{ flex: 1, flexBasis: 0 }} value={true}>
        Fixed
      </ToggleButton>
      <ToggleButton sx={{ flex: 1, flexBasis: 0 }} value={false}>
        Generator
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
//
//
// Value Input
const ValueInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const { min, max, integer } = useMinMaxInteger(dataType)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => {
        set(value, notEmpty(value))
      }}
    />
  )
})

ValueInputForward.displayName = 'ValueInput'
const ValueInput = meme(ValueInputForward)

const ValueInputComponent = meme(() => {
  const value = useAddRegisterZustand((z) => z.value)
  const valid = useAddRegisterZustand((z) => z.valid.value)
  const setValue = useAddRegisterZustand((z) => z.setValue)

  useEffect(() => {
    const edit = useAddRegisterZustand.getState().serverRegisterEdit !== undefined
    if (edit) return
    // Default the value to 0
    setValue('0', true)
  }, [setValue])

  return (
    <TextField
      label="Value"
      variant="outlined"
      size="small"
      sx={{ minWidth: 100 }}
      value={value}
      error={!valid}
      slotProps={{
        input: {
          inputComponent: ValueInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setValue })
        }
      }}
    />
  )
})

//
//
//
//
// Min/Max Masks

const MinInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const maxValue = useAddRegisterZustand((z) => z.max)
  const { min, max, integer } = useMinMaxInteger(dataType, 'min', maxValue)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

MinInputForward.displayName = 'MinInput'
const MinInput = meme(MinInputForward)

const MaxInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useAddRegisterZustand((z) => z.dataType)
  const minValue = useAddRegisterZustand((z) => z.min)
  const { min, integer, max } = useMinMaxInteger(dataType, 'max', minValue)

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={min}
      max={max}
      autofix
      {...{
        scale: integer ? 0 : 7,
        thousandsSeparator: '',
        radix: '.', // fractional delimiter
        mapToRadix: ['.', ','] // symbols to process as radix
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

MaxInputForward.displayName = 'MaxInput'
const MaxInput = meme(MaxInputForward)

//
//
// Min Max components
const MinTextField = meme(() => {
  const min = useAddRegisterZustand((z) => String(z.min))
  const valid = useAddRegisterZustand((z) => z.valid.min)
  const setMin = useAddRegisterZustand((z) => z.setMin)

  return (
    <TextField
      error={!valid}
      label="Min Value"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={min}
      slotProps={{
        input: {
          inputComponent: MinInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMin })
        }
      }}
    />
  )
})

const MaxTextField = meme(() => {
  const max = useAddRegisterZustand((z) => String(z.max))
  const valid = useAddRegisterZustand((z) => z.valid.max)
  const setMax = useAddRegisterZustand((z) => z.setMax)

  return (
    <TextField
      error={!valid}
      label="Max Value"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={max}
      slotProps={{
        input: {
          inputComponent: MaxInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setMax })
        }
      }}
    />
  )
})

//
//
//
//
// Interval

const IntervalInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={1}
      max={10}
      autofix
      {...{
        scale: 0,
        thousandsSeparator: ''
      }}
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

IntervalInputForward.displayName = 'IntervalInput'
const IntervalInput = meme(IntervalInputForward)

const IntervalTextField = meme(() => {
  const interval = useAddRegisterZustand((z) => String(z.interval))
  const valid = useAddRegisterZustand((z) => z.valid.interval)
  const setInterval = useAddRegisterZustand((z) => z.setInterval)

  return (
    <TextField
      error={!valid}
      label="Interval (s)"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={interval}
      slotProps={{
        input: {
          inputComponent: IntervalInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setInterval })
        }
      }}
    />
  )
})

//
//
//
//
// ValueParameters
const ValueParameters = meme(() => {
  const fixed = useAddRegisterZustand((z) => z.fixed)

  return fixed ? (
    <ValueInputComponent />
  ) : (
    <>
      <MinTextField />
      <MaxTextField />
      <IntervalTextField />
    </>
  )
})

//
//
//
//
// Comment
const CommentField = meme(() => {
  const comment = useAddRegisterZustand((z) => z.comment)
  const setComment = useAddRegisterZustand((z) => z.setComment)

  return (
    <TextField
      label="Comment"
      variant="outlined"
      size="small"
      value={comment}
      onChange={(e) => setComment(e.target.value)}
    />
  )
})

//
//
//
//
// Toggle endianness button
const ToggleEndianButton = meme(() => {
  const littleEndian = useAddRegisterZustand((z) => z.littleEndian)
  const setLittleEndian = useAddRegisterZustand((z) => z.setLittleEndian)

  return (
    <ToggleButtonGroup
      sx={{ height: 37.13 }}
      size="small"
      exclusive
      color="primary"
      value={littleEndian}
      onChange={(_, v) => v !== null && setLittleEndian(v)}
    >
      <ToggleButton value={false} sx={{ whiteSpace: 'nowrap' }}>
        BE
      </ToggleButton>
      <ToggleButton value={true}>LE</ToggleButton>
    </ToggleButtonGroup>
  )
})

//
//
//
//
// Add button
const AddButton = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const valid = useAddRegisterZustand((z) => {
    if (z.fixed) return z.valid.address && z.valid.value
    return z.valid.address && z.valid.min && z.valid.max && z.valid.interval
  })

  const addRegister = useCallback(() => {
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
      littleEndian,
      setRegisterType,
      setEditRegister,
      serverRegisterEdit
    } = useAddRegisterZustand.getState()
    if (!registerType) return

    const z = useServerZustand.getState()
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)

    const commonParams: Omit<AddRegisterParams, 'params'> = {
      uuid,
      unitId
    }
    const baseRegisterParams: RegisterParamsBasePart = {
      address: Number(address),
      dataType,
      comment,
      littleEndian,
      registerType
    }

    // If editing and the address has changed, remove the old register first
    if (edit && serverRegisterEdit) {
      const oldAddress = serverRegisterEdit.params.address
      if (oldAddress !== Number(address)) {
        z.removeRegister({
          uuid,
          unitId,
          address: oldAddress,
          registerType
        })
      }
    }

    if (fixed) {
      z.addRegister({
        ...commonParams,
        params: {
          ...baseRegisterParams,
          value: Number(value)
        }
      })
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

    setRegisterType(undefined)
    setEditRegister(undefined)
  }, [edit])

  return (
    <Button
      sx={{ flex: 1, flexBasis: 0 }}
      disabled={!valid}
      variant="contained"
      color="primary"
      onClick={addRegister}
    >
      {edit ? 'Submit Change' : 'Add Register'}
    </Button>
  )
})

const DeleteButton = meme(() => {
  const [over, setOver] = useState(false)
  const handleClick = useCallback(() => {
    const { address, registerType, setRegisterType, setEditRegister } =
      useAddRegisterZustand.getState()
    if (!registerType) return

    const z = useServerZustand.getState()
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)

    z.removeRegister({
      uuid,
      unitId,
      address: Number(address),
      registerType
    })

    setRegisterType(undefined)
    setEditRegister(undefined)
  }, [])

  return (
    <Button
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
const AddRegister = meme(() => {
  const edit = useAddRegisterZustand((z) => z.serverRegisterEdit !== undefined)
  const registerType = useAddRegisterZustand((z) => z.registerType)
  const setRegisterType = useAddRegisterZustand((z) => z.setRegisterType)
  const setEditRegister = useAddRegisterZustand((z) => z.setEditRegister)

  // Edit mode
  useEffect(() => {
    const state = useAddRegisterZustand.getState()
    if (!state.serverRegisterEdit) return

    const { address, comment, dataType, littleEndian, registerType, interval, max, min, value } =
      state.serverRegisterEdit.params

    state.setFixed(value !== undefined)
    state.setAddress(String(address))
    state.setRegisterType(registerType)
    state.setComment(comment)
    state.setLittleEndian(littleEndian)
    state.setInterval(interval ? String(interval / 1000) : '1')
    state.setMax(String(max))
    state.setMin(String(min))
    state.setValue(String(value))
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
          <ToggleEndianButton />
          <AddressField />
          <DataTypeSelect />
          <ValueParameters />
        </Box>
        <CommentField />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <AddButton />
          {edit && <DeleteButton />}
        </Box>
      </Paper>
    </Modal>
  )
})
export default AddRegister
