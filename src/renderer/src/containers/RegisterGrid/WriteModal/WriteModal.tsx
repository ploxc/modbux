import { Publish } from '@mui/icons-material'
import {
  Box,
  Button,
  ButtonGroup,
  FormControl,
  InputLabel,
  MenuItem,
  Modal,
  Paper,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { meme } from '@renderer/components/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { DataType, RegisterType } from '@shared'
import { forwardRef, RefObject, useCallback, useEffect, useMemo } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

const getMinMaxValues = (dataType: DataType): { min: number; max: number } => {
  switch (dataType) {
    case DataType.Int16:
      return { min: -32768, max: 32767 }
    case DataType.UInt16:
      return { min: 0, max: 65535 }
    case DataType.Int32:
      return { min: -2147483648, max: 2147483647 }
    case DataType.UInt32:
      return { min: 0, max: 4294967295 }
    case DataType.Int64:
      return { min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER } // JavaScript safe integer range
    case DataType.UInt64:
      return { min: 0, max: Number.MAX_SAFE_INTEGER } // Max safe integer in JavaScript for unsigned 64-bit
    case DataType.Float:
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Closest approximation for float
    case DataType.Double:
      return { min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY } // Double in JS is the same as float
    default:
      return { min: 0, max: 0 }
  }
}

interface ValueInputZusand {
  dataType: DataType
  setDataType: (dataType: DataType) => void
  value: string
  valid: boolean
  setValue: MaskSetFn
  address: number
  setAddress: (address: number) => void
  coilFunction: 5 | 15
  setCoilFunction: (coilFunction: 5 | 15) => void
  coils: boolean[]
  initCoils: (coils: boolean[]) => void
  setCoils: (coil: boolean, index: number) => void
}

const useValueInputZustand = create<ValueInputZusand, [['zustand/mutative', never]]>(
  mutative((set) => ({
    dataType: DataType.Int16,
    setDataType: (dataType: DataType) =>
      set((state) => {
        state.dataType = dataType
      }),
    value: '0',
    valid: true,
    setValue: (value, valid) =>
      set((state) => {
        state.value = value
        state.valid = !!valid
      }),
    address: 0,
    setAddress: (address: number) =>
      set((state) => {
        state.address = address
      }),
    coilFunction: 5,
    setCoilFunction: (coilFunction: 5 | 15) =>
      set((state) => {
        state.coilFunction = coilFunction
      }),
    coils: [],
    initCoils: (coils) =>
      set((state) => {
        state.coils = coils
      }),
    setCoils: (coil, index) =>
      set((state) => {
        state.coils[index] = coil
      })
  }))
)

const ValueInput = meme(
  forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
    const { set, ...other } = props
    const dataType = useValueInputZustand((z) => z.dataType)

    const integer = useMemo(
      () =>
        [
          DataType.Int16,
          DataType.UInt16,
          DataType.Int32,
          DataType.UInt32,
          DataType.Int64,
          DataType.UInt64
        ].includes(dataType),
      [dataType]
    )

    const { min, max } = useMemo(() => getMinMaxValues(dataType), [dataType])

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
        onAccept={(value: any) => set(value, value.length > 0)}
      />
    )
  })
)

const ValueInputComponent = meme(() => {
  const value = useValueInputZustand((z) => z.value)
  const valid = useValueInputZustand((z) => z.valid)
  const setValue = useValueInputZustand((z) => z.setValue)

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
          inputComponent: ValueInput as any,
          inputProps: maskInputProps({ set: setValue })
        }
      }}
    />
  )
})

const DataTypeSelect = meme(() => {
  const labelId = 'data-type-select'

  const dataType = useValueInputZustand((z) => z.dataType)
  const setDataType = useValueInputZustand((z) => z.setDataType)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={dataType}
        label="Type"
        onChange={(e) => setDataType(e.target.value as DataType)}
      >
        <MenuItem value={DataType.Int16}>INT16</MenuItem>
        <MenuItem value={DataType.UInt16}>UINT16</MenuItem>
        <MenuItem value={DataType.Int32}>INT32</MenuItem>
        <MenuItem value={DataType.UInt32}>UINT32</MenuItem>
        <MenuItem value={DataType.Float}>FLOAT</MenuItem>

        <MenuItem value={DataType.Int64}>INT64</MenuItem>
        <MenuItem value={DataType.UInt64}>UINT64</MenuItem>
        <MenuItem value={DataType.Double}>DOUBLE</MenuItem>
      </Select>
    </FormControl>
  )
})

const WriteRegistersButton = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const dataType = useValueInputZustand((z) => z.dataType)
  const value = useValueInputZustand((z) => z.value)

  const handleWrite = useCallback(
    (single: boolean) => {
      window.api.write({
        address,
        dataType,
        type: RegisterType.HoldingRegisters,
        value: Number(value),
        single
      })
    },
    [address, dataType, value]
  )

  const singleDisabled = useMemo(() => {
    return ![DataType.Int16, DataType.UInt16].includes(dataType)
  }, [dataType])

  return (
    <ButtonGroup size="small">
      <Button
        title="FC6: Write single register"
        disabled={singleDisabled}
        variant="outlined"
        color="primary"
        onClick={() => handleWrite(true)}
      >
        6
      </Button>
      <Button
        title="FC16: Write multiple registers"
        variant="outlined"
        color="primary"
        onClick={() => handleWrite(false)}
      >
        16
      </Button>
    </ButtonGroup>
  )
})

const CoilFunctionSelect = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const registerConfigAddress = useRootZustand((z) => z.registerConfig.address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)
  const setCoilFunction = useValueInputZustand((z) => z.setCoilFunction)

  const handleWrite = useCallback(() => {
    window.api.write({
      address,
      type: RegisterType.Coils,
      value: coils.slice(address - registerConfigAddress),
      single: coilFunction === 5
    })
  }, [coilFunction, coils])

  return (
    <Box sx={{ display: 'flex' }}>
      <ToggleButtonGroup
        sx={{ flex: 1 }}
        size="small"
        exclusive
        color="primary"
        value={coilFunction}
        onChange={(_, v) => v !== null && setCoilFunction(v)}
      >
        <ToggleButton sx={{ flex: 1, flexBasis: 0 }} title="FC5: Write single coils" value={5}>
          5
        </ToggleButton>
        <ToggleButton sx={{ flex: 1, flexBasis: 0 }} title="FC15: Write multiple coils" value={15}>
          15
        </ToggleButton>
      </ToggleButtonGroup>
      <Button variant="outlined" color="primary" onClick={handleWrite}>
        <Publish />
      </Button>
    </Box>
  )
})

interface CoilButtonProps {
  address: number
  index: number
}

const CoilButton = meme(({ address, index }: CoilButtonProps) => {
  const state = useValueInputZustand((z) => z.coils[index])
  const setCoils = useValueInputZustand((z) => z.setCoils)

  return (
    <Button
      size="small"
      variant={state ? 'contained' : 'outlined'}
      color="primary"
      onClick={() => setCoils(!state, index)}
      sx={{ flex: 1, flexBasis: 0 }}
    >
      {address}
    </Button>
  )
})

const Coils = () => {
  const length = useRootZustand((z) => z.registerConfig.length)
  const registerConfigAddress = useRootZustand((z) => z.registerConfig.address)
  const address = useValueInputZustand((z) => z.address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)
  const initCoils = useValueInputZustand((z) => z.initCoils)

  useEffect(() => {
    const newCoils = Array(length).fill(false)
    initCoils(newCoils)
  }, [length])

  const rows = useMemo(() => {
    const amount = Math.ceil(length / 8)
    return new Array(amount).fill(null)
  }, [length])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {coilFunction === 5 ? (
        <CoilButton address={address} index={address - registerConfigAddress} />
      ) : (
        rows.map((_, ri) => {
          return (
            <Box
              sx={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap' }}
              key={`coil_row_${ri}`}
            >
              {coils.slice(ri * 8, ri * 8 + 8).map((_, ci) => {
                const index = ci + ri * 8
                const coilAddress = address + index

                return coilAddress < registerConfigAddress + length ? (
                  <CoilButton
                    key={`coil_${coilAddress}`}
                    address={coilAddress}
                    index={coilAddress - registerConfigAddress}
                  />
                ) : null
              })}
            </Box>
          )
        })
      )}
    </Box>
  )
}

interface Props {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLDivElement>
  type: RegisterType
}

const WriteModal = ({ open, onClose, address, actionCellRef, type }: Props) => {
  const rect = actionCellRef.current?.getBoundingClientRect()
  const right = (rect?.right ? window.innerWidth - rect.right : 0) + 38
  const setValue = useValueInputZustand((z) => z.setValue)
  const setAddress = useValueInputZustand((z) => z.setAddress)

  const handleClose = useCallback(() => {
    setValue('0')
    onClose()
  }, [setValue, onClose])

  useEffect(() => {
    setAddress(address)
  }, [address])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      slotProps={{ backdrop: { sx: { background: 'transparent' } } }}
    >
      <Paper
        elevation={5}
        sx={{ position: 'absolute', right, top: rect?.top || 0, display: 'flex' }}
      >
        {type === RegisterType.HoldingRegisters ? (
          <>
            <DataTypeSelect />
            <ValueInputComponent />
            <WriteRegistersButton />
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            <CoilFunctionSelect />
            <Coils />
          </Box>
        )}
      </Paper>
    </Modal>
  )
}

export default WriteModal
