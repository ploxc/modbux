/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { Publish } from '@mui/icons-material'
import {
  Box,
  Button,
  ButtonGroup,
  InputBaseComponentProps,
  Modal,
  Paper,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useRootZustand } from '@renderer/context/root.zustand'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { useMinMaxInteger } from '@renderer/hooks'
import { BaseDataType, BaseDataTypeSchema, notEmpty, RegisterType } from '@shared'
import { ElementType, forwardRef, RefObject, useCallback, useEffect, useMemo } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import { create } from 'zustand'
import { mutative } from 'zustand-mutative'

interface ValueInputZusand {
  dataType: BaseDataType
  setDataType: (dataType: BaseDataType) => void
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
    dataType: 'int16',
    setDataType: (dataType) =>
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

const ValueInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useValueInputZustand((z) => z.dataType)
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

const ValueInputComponent = meme(({ address }: { address: number }) => {
  const value = useValueInputZustand((z) => z.value)
  const valid = useValueInputZustand((z) => z.valid)
  const setValue = useValueInputZustand((z) => z.setValue)

  return (
    <TextField
      label={`Address ${address} value`}
      variant="outlined"
      size="small"
      sx={{ minWidth: 100 }}
      value={value}
      error={!valid}
      data-testid="write-value-input"
      slotProps={{
        input: {
          inputComponent: ValueInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setValue })
        }
      }}
    />
  )
})

const DataTypeSelect = meme(({ address }: { address: number }) => {
  const dataType = useValueInputZustand((z) => z.dataType)
  const setDataType = useValueInputZustand((z) => z.setDataType)

  // Set the data type based on the address if it's defined in the register mapping
  useEffect(() => {
    const {
      registerMapping,
      registerConfig: { type }
    } = useRootZustand.getState()

    const dataType = registerMapping[type][address]?.dataType
    if (!dataType) return

    const result = BaseDataTypeSchema.safeParse(dataType)
    if (result.success) setDataType(result.data)
  }, [address, setDataType])

  return <DataTypeSelectInput dataType={dataType} setDataType={setDataType} />
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
        type: 'holding_registers',
        value: Number(value),
        single
      })
    },
    [address, dataType, value]
  )

  const singleDisabled = useMemo(() => {
    return !['int16', 'uint16'].includes(dataType)
  }, [dataType])

  return (
    <ButtonGroup size="small">
      <Button
        title="FC6: Write single register"
        disabled={singleDisabled}
        variant="outlined"
        color="primary"
        onClick={() => handleWrite(true)}
        data-testid="write-fc6-btn"
      >
        6
      </Button>
      <Button
        title="FC16: Write multiple registers"
        variant="outlined"
        color="primary"
        onClick={() => handleWrite(false)}
        data-testid="write-fc16-btn"
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
      type: 'coils',
      value: coils.slice(address - registerConfigAddress),
      single: coilFunction === 5
    })
  }, [address, coilFunction, coils, registerConfigAddress])

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
        <ToggleButton
          sx={{ flex: 1, flexBasis: 0 }}
          title="FC5: Write single coils"
          value={5}
          data-testid="write-fc5-btn"
        >
          5
        </ToggleButton>
        <ToggleButton
          sx={{ flex: 1, flexBasis: 0 }}
          title="FC15: Write multiple coils"
          value={15}
          data-testid="write-fc15-btn"
        >
          15
        </ToggleButton>
      </ToggleButtonGroup>
      <Button
        variant="outlined"
        color="primary"
        onClick={handleWrite}
        data-testid="write-submit-btn"
        aria-label="Write coils"
      >
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
      data-testid={`write-coil-${address}-select-btn`}
      variant={state ? 'contained' : 'outlined'}
      color="primary"
      onClick={() => setCoils(!state, index)}
      sx={{ flex: 1, flexBasis: 0 }}
    >
      {address}
    </Button>
  )
})

const Coils = meme(() => {
  const length = useRootZustand((z) => z.registerConfig.length)
  const registerConfigAddress = useRootZustand((z) => z.registerConfig.address)
  const address = useValueInputZustand((z) => z.address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)
  const initCoils = useValueInputZustand((z) => z.initCoils)

  useEffect(() => {
    const newCoils = Array(length).fill(false)
    initCoils(newCoils)
  }, [initCoils, length])

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
})

interface Props {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLButtonElement>
  type: RegisterType
}

const WriteModal = meme(({ open, onClose, address, actionCellRef, type }: Props) => {
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
    // ! deliberate only once when the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      slotProps={{ backdrop: { sx: { background: 'transparent' } } }}
    >
      <Paper
        elevation={5}
        sx={{ position: 'absolute', right, top: rect?.top ?? 0, display: 'flex' }}
      >
        {type === 'holding_registers' ? (
          <>
            <DataTypeSelect address={address} />
            <ValueInputComponent address={address} />
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
})

export default WriteModal
