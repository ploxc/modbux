import Publish from '@mui/icons-material/Publish'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Modal from '@mui/material/Modal'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useMinMaxInteger } from '@renderer/hooks'
import { BaseDataTypeSchema, notEmpty, RegisterType } from '@shared'
import { ElementType, forwardRef, RefObject, useCallback, useEffect, useMemo } from 'react'
import { IMaskInput, IMask } from 'react-imask'
import { seedCoils, useValueInputZustand } from './writeModal.zustand'

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

  const setValue = useValueInputZustand.getState().setValue

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

  const setDataType = useValueInputZustand.getState().setDataType

  // Set the data type based on the address if it's defined in the register mapping
  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    const {
      registerMapping,
      registerConfig: { type }
    } = useClientZustand.getState()

    const dataType = registerMapping[type][address]?.dataType
    if (!dataType) return

    const result = BaseDataTypeSchema.safeParse(dataType)
    if (result.success) valueInputZustand.setDataType(result.data)
  }, [address])

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
  const registerConfigAddress = useClientZustand((z) => z.registerConfig.address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)

  const handleFunctionChange = useCallback((_event: unknown, value: 5 | 15 | null): void => {
    if (value === null) return
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setCoilFunction(value)
  }, [])

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
        onChange={handleFunctionChange}
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

  const handleClick = useCallback((): void => {
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setCoils(!state, index)
  }, [state, index])

  return (
    <Button
      size="small"
      data-testid={`write-coil-${address}-select-btn`}
      aria-pressed={state}
      variant={state ? 'contained' : 'outlined'}
      color="primary"
      onClick={handleClick}
      sx={{ flex: 1, flexBasis: 0 }}
    >
      {address}
    </Button>
  )
})

const Coils = meme(() => {
  const length = useClientZustand((z) => z.registerConfig.length)
  const registerConfigAddress = useClientZustand((z) => z.registerConfig.address)
  const address = useValueInputZustand((z) => z.address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)

  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    const { registerData } = useDataZustand.getState()
    valueInputZustand.initCoils(seedCoils(registerData, registerConfigAddress, length))
  }, [length, registerConfigAddress])

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

interface WriteModalProps {
  address: number
  open: boolean
  onClose: () => void
  actionCellRef: RefObject<HTMLButtonElement>
  type: RegisterType
}

const WriteModal = meme(({ open, onClose, address, actionCellRef, type }: WriteModalProps) => {
  const rect = actionCellRef.current?.getBoundingClientRect()
  const right = (rect?.right ? window.innerWidth - rect.right : 0) + 38

  const handleClose = useCallback(() => {
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setValue('0')
    onClose()
  }, [onClose])

  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setAddress(address)
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
