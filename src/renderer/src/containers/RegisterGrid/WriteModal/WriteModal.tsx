import { Publish } from '@mui/icons-material'
import {
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Modal,
  Paper,
  Select,
  TextField
} from '@mui/material'
import { meme } from '@renderer/components/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/types'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { DataType, RegisterType } from '@shared'
import { forwardRef, RefObject, useCallback, useEffect } from 'react'
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
      return { min: Number.MIN_VALUE, max: Number.MAX_VALUE } // Closest approximation for float
    case DataType.Double:
      return { min: Number.MIN_VALUE, max: Number.MAX_VALUE } // Double in JS is the same as float
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
      })
  }))
)

const ValueInput = meme(
  forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
    const { set, ...other } = props
    const dataType = useValueInputZustand((z) => z.dataType)

    const integer = [
      DataType.Int16,
      DataType.UInt16,
      DataType.Int32,
      DataType.UInt32,
      DataType.Int64,
      DataType.UInt64
    ].includes(dataType)

    const { min, max } = getMinMaxValues(dataType)

    return (
      <IMaskInput
        {...other}
        mask={IMask.MaskedNumber}
        autofix
        {...{
          scale: integer ? 0 : 7,
          thousandsSeparator: '',
          radix: '.', // fractional delimiter
          mapToRadix: ['.', ','], // symbols to process as radix
          min,
          max
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

const WriteButton = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const dataType = useValueInputZustand((z) => z.dataType)
  const value = useValueInputZustand((z) => z.value)

  const handleWrite = useCallback(() => {
    window.api.write({
      address,
      performRead: true,
      dataType,
      type: RegisterType.HoldingRegisters,
      value: Number(value)
    })
  }, [address, dataType, value])

  return (
    <Button variant="outlined" color="primary" onClick={handleWrite}>
      <Publish />
    </Button>
  )
})

interface Props {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLDivElement>
}

const WriteModal = ({ open, onClose, address, actionCellRef }: Props) => {
  const rect = actionCellRef.current?.getBoundingClientRect()
  const right = (rect?.right ? window.innerWidth - rect.right : 0) + 38
  const setValue = useValueInputZustand((z) => z.setValue)
  const setAddress = useValueInputZustand((z) => z.setAddress)

  const handleClose = () => {
    setValue('0')
    onClose()
  }

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
        <DataTypeSelect />
        <ValueInputComponent />
        <WriteButton />
      </Paper>
    </Modal>
  )
}

export default WriteModal
