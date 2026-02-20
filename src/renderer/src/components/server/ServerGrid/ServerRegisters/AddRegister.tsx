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
import { AddRegisterParams, BaseDataType, notEmpty, RegisterParamsBasePart } from '@shared'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { useMinMaxInteger } from '@renderer/hooks'
import { useServerZustand } from '@renderer/context/server.zustand'
import { Delete } from '@mui/icons-material'
import { DateTimePicker, LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon'
import { DateTime } from 'luxon'

//
//
//
//
// Address
const AddressInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  // Set maximum address based on data type
  const maxAddress = useAddRegisterZustand((z) => {
    if (['int32', 'uint32', 'float', 'unix'].includes(z.dataType)) return 65534
    if (['int64', 'uint64', 'double', 'datetime'].includes(z.dataType)) return 65532
    if (z.dataType === 'utf8') return Math.max(0, 65535 - (Number(z.registerLength) || 10) + 1)
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

  return (
    <FormControl error={!valid}>
      <TextField
        data-testid="add-reg-address-input"
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
  const dataType = useAddRegisterZustand((z) => z.dataType)

  // UTF-8 is always fixed — hide toggle
  if (dataType === 'utf8') return null

  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      color="primary"
      value={fixed}
      onChange={(_, v) => v !== null && setFixed(v)}
      sx={{ flex: 1 }}
    >
      <ToggleButton data-testid="add-reg-fixed-btn" sx={{ flex: 1, flexBasis: 0 }} value={true}>
        Fixed
      </ToggleButton>
      <ToggleButton
        data-testid="add-reg-generator-btn"
        sx={{ flex: 1, flexBasis: 0 }}
        value={false}
      >
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

  return (
    <TextField
      data-testid="add-reg-value-input"
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
      data-testid="add-reg-min-input"
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
      data-testid="add-reg-max-input"
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
      data-testid="add-reg-interval-input"
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
// DateTimePicker for unix/datetime fixed mode
const DateTimeField = meme(() => {
  const value = useAddRegisterZustand((z) => z.value)
  const showDatePickerUtc = useAddRegisterZustand((z) => z.showDatePickerUtc)
  const setValue = useAddRegisterZustand((z) => z.setValue)
  const setShowDatePickerUtc = useAddRegisterZustand((z) => z.setShowDatePickerUtc)

  const dateValue = value && value !== '0' ? DateTime.fromMillis(Number(value)) : DateTime.now()

  return (
    <LocalizationProvider dateAdapter={AdapterLuxon}>
      <DateTimePicker
        timezone={showDatePickerUtc ? 'UTC' : undefined}
        label="Date & Time"
        value={dateValue}
        onChange={(dt) => {
          if (dt && dt.isValid) {
            setValue(String(dt.toMillis()), true)
          }
        }}
        ampm={false}
        slotProps={{
          textField: {
            size: 'small',
            sx: { minWidth: 220 },
            inputProps: { 'data-testid': 'add-reg-datetime-input' }
          }
        }}
      />
      <ToggleButtonGroup size="small" value={showDatePickerUtc} color="primary">
        <ToggleButton
          value={true}
          data-testid="add-reg-datetime-show-utc"
          aria-label="Show UTC time for datepicker"
          title="Show UTC time for datepicker"
          onChange={() => setShowDatePickerUtc(!showDatePickerUtc)}
        >
          UTC
        </ToggleButton>
      </ToggleButtonGroup>
    </LocalizationProvider>
  )
})

//
//
//
//
// String value input for utf8
const StringValueField = meme(() => {
  const stringValue = useAddRegisterZustand((z) => z.stringValue)
  const setStringValue = useAddRegisterZustand((z) => z.setStringValue)
  const maxBytes = useAddRegisterZustand((z) => (Number(z.registerLength) || 10) * 2)
  const valid = useAddRegisterZustand((z) => z.valid.stringValue)

  useEffect(() => {
    // Reevaluate string length when changing register Length
    setStringValue(useAddRegisterZustand.getState().stringValue)
  }, [maxBytes, setStringValue])

  const helperText = `${new TextEncoder().encode(stringValue).length} / ${maxBytes} bytes`

  return (
    <TextField
      data-testid="add-reg-string-input"
      label="String Value"
      variant="outlined"
      size="small"
      sx={{ minWidth: 200, flex: 1 }}
      value={stringValue}
      onChange={(e) => setStringValue(e.target.value)}
      helperText={helperText}
      error={!valid}
    />
  )
})

//
//
//
//
// Register length input for utf8
const RegisterLengthForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props

  return (
    <IMaskInput
      {...other}
      mask={IMask.MaskedNumber}
      min={1}
      max={124}
      autofix
      scale={0}
      thousandsSeparator=""
      inputRef={ref}
      onAccept={(value) => set(value, notEmpty(value))}
    />
  )
})

RegisterLengthForward.displayName = 'RegisterLengthInput'
const RegisterLengthInput = meme(RegisterLengthForward)

const RegisterLengthField = meme(() => {
  const registerLength = useAddRegisterZustand((z) => z.registerLength)
  const valid = useAddRegisterZustand((z) => z.valid.registerLength)
  const setRegisterLength = useAddRegisterZustand((z) => z.setRegisterLength)

  return (
    <TextField
      data-testid="add-reg-length-input"
      error={!valid}
      label="Registers"
      variant="outlined"
      size="small"
      sx={{ width: 90 }}
      value={registerLength}
      slotProps={{
        input: {
          inputComponent: RegisterLengthInput as unknown as ElementType<
            InputBaseComponentProps,
            'input'
          >,
          inputProps: maskInputProps({ set: setRegisterLength })
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
  const dataType = useAddRegisterZustand((z) => z.dataType)

  // UTF-8: string input + register length
  if (dataType === 'utf8') {
    return (
      <>
        <StringValueField />
        <RegisterLengthField />
      </>
    )
  }

  // Unix/datetime fixed: date picker
  if (['unix', 'datetime'].includes(dataType) && fixed) {
    return <DateTimeField />
  }

  // Unix/datetime generator: only interval
  if (['unix', 'datetime'].includes(dataType) && !fixed) {
    return <IntervalTextField />
  }

  // Numeric fixed: value input
  if (fixed) {
    return <ValueInputComponent />
  }

  // Numeric generator: min/max/interval
  return (
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
      data-testid="add-reg-comment-input"
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
// Toggle endianness button removed - now global per server

//
//
//
//
// Shared submit logic — adds or edits the register, returns the address and dataType used
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
const AddButtons = meme(() => {
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

const DeleteButton = meme(() => {
  const [over, setOver] = useState(false)
  const handleClick = useCallback(() => {
    const { address, registerType, setRegisterType, setEditRegister } =
      useAddRegisterZustand.getState()
    if (!registerType) return

    const z = useServerZustand.getState()
    const uuid = z.selectedUuid
    const unitId = z.getUnitId(uuid)

    const addr = Number(address)
    const entry = z.serverRegisters[uuid]?.[unitId]?.[registerType]?.[addr]
    const dataType = entry?.params?.dataType ?? 'uint16'

    z.removeRegister({
      uuid,
      unitId,
      address: addr,
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
