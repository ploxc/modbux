import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
import Publish from '@mui/icons-material/Publish'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import Popover, { PopoverActions } from '@mui/material/Popover'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import DataTypeSelectInput from '@renderer/components/shared/inputs/DataTypeSelectInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps, MaskInputProps } from '@renderer/components/shared/inputs/types'
import {
  selectedClientUuid,
  useClientZustand,
  getShownType,
  getSelectedUnit,
  selectedUnit
} from '@renderer/context/client.zustand'
import { getShownSection } from '@renderer/context/live.zustand'
import { useMinMaxInteger } from '@renderer/hooks'
import { notEmpty, RegisterType } from '@shared'
import { ElementType, forwardRef, RefObject, useCallback, useEffect, useMemo, useRef } from 'react'
import { decimalMask } from '@renderer/components/shared/inputs/decimalMask'
import { IMaskInput } from 'react-imask'
import { lineColor } from '@renderer/theme'
import { seedCoils, useValueInputZustand, writeDataTypeFor } from './writeModal.zustand'

const ValueInputForward = forwardRef<HTMLInputElement, MaskInputProps>((props, ref) => {
  const { set, ...other } = props
  const dataType = useValueInputZustand((z) => z.dataType)
  const { min, max, integer } = useMinMaxInteger(dataType)

  return (
    <IMaskInput
      {...other}
      {...decimalMask(integer)}
      min={min}
      max={max}
      autofix
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

export const DataTypeSelect = meme(({ address }: { address: number }) => {
  const dataType = useValueInputZustand((z) => z.dataType)

  const setDataType = useValueInputZustand.getState().setDataType

  // The type comes from the register mapping, and an address the mapping says
  // nothing about gets the default rather than the last address's type.
  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    const { registerMapping } = getSelectedUnit()

    valueInputZustand.setDataType(
      writeDataTypeFor(registerMapping[getShownType()][address]?.dataType)
    )
  }, [address])

  return <DataTypeSelectInput dataType={dataType} setDataType={setDataType} />
})

export const WriteRegistersButton = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const dataType = useValueInputZustand((z) => z.dataType)
  const value = useValueInputZustand((z) => z.value)
  const valid = useValueInputZustand((z) => z.valid)

  const handleWrite = useCallback(
    (single: boolean) => {
      window.api.write({
        uuid: selectedClientUuid(),
        unit: getSelectedUnit().uuid,
        parameters: {
          address,
          dataType,
          type: 'holding_registers',
          value: Number(value),
          single
        }
      })
    },
    [address, dataType, value]
  )

  // An empty field is `Number('')`, which is 0, and 0 is a value the device
  // accepts without complaint. The mask says whether anything was typed, so the
  // buttons say what the red box already says.
  const singleDisabled = useMemo(() => {
    return !valid || !['int16', 'uint16'].includes(dataType)
  }, [valid, dataType])

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
        disabled={!valid}
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

export const CoilFunctionSelect = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const type = useSectionType()
  const registerConfigAddress = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const coils = useValueInputZustand((z) => z.coils)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)

  const handleFunctionChange = useCallback((_event: unknown, value: 5 | 15 | null): void => {
    if (value === null) return
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setCoilFunction(value)
  }, [])

  // FC15 writes the coils the picker draws: from the one the dialog opened on,
  // at most `COILS_PER_WRITE` of them and no further than the window the
  // toolbar read. FC5 sends the first of them alone.
  const handleWrite = useCallback(() => {
    const from = address - registerConfigAddress
    window.api.write({
      uuid: selectedClientUuid(),
      unit: getSelectedUnit().uuid,
      parameters: {
        address,
        type: 'coils',
        value: coils.slice(from, from + COILS_PER_WRITE),
        single: coilFunction === 5
      }
    })
  }, [address, coilFunction, coils, registerConfigAddress])

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <ToggleButtonGroup
        size="small"
        exclusive
        color="primary"
        value={coilFunction}
        onChange={handleFunctionChange}
      >
        <ToggleButton title="FC5: Write single coils" value={5} data-testid="write-fc5-btn">
          5
        </ToggleButton>
        <ToggleButton title="FC15: Write multiple coils" value={15} data-testid="write-fc15-btn">
          15
        </ToggleButton>
      </ToggleButtonGroup>
      {coilFunction === 5 && <SingleCoil />}
      <Box sx={{ flex: 1 }} />
      <Button
        size="small"
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

/** How many coils one FC15 from the dialog writes: eight rows of eight. */
const COILS_PER_WRITE = 64

/** The width of an address, five digits in the monospace the grid uses. */
const ADDRESS_WIDTH = 44

const addressLabel = {
  width: ADDRESS_WIDTH,
  fontFamily: 'monospace',
  fontSize: 11.5,
  color: 'text.primary',
  textAlign: 'right'
} as const

/** FC5: the coil the dialog opened on, and FALSE or TRUE for it. */
const SingleCoil = meme(() => {
  const address = useValueInputZustand((z) => z.address)
  const type = useSectionType()
  const registerConfigAddress = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const index = address - registerConfigAddress
  const state = useValueInputZustand((z) => z.coils[index])

  const handleChange = useCallback(
    (_event: unknown, value: boolean | null): void => {
      if (value === null) return
      const valueInputZustand = useValueInputZustand.getState()
      valueInputZustand.setCoils(value, index)
    },
    [index]
  )

  return (
    <>
      <Box sx={addressLabel}>{address}</Box>
      <ToggleButtonGroup
        size="small"
        exclusive
        color="primary"
        value={state ?? false}
        onChange={handleChange}
      >
        <ToggleButton value={false} data-testid={`write-coil-${address}-false-btn`}>
          FALSE
        </ToggleButton>
        <ToggleButton value={true} data-testid={`write-coil-${address}-true-btn`}>
          TRUE
        </ToggleButton>
      </ToggleButtonGroup>
    </>
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
      title={`Coil ${address}`}
      aria-pressed={state}
      variant={state ? 'contained' : 'outlined'}
      color="primary"
      onClick={handleClick}
      sx={{
        minWidth: 0,
        width: '100%',
        px: 0,
        fontFamily: 'monospace',
        ...(!state && { borderColor: lineColor, color: 'text.secondary' })
      }}
    >
      {state ? 1 : 0}
    </Button>
  )
})

const OFFSETS = [0, 1, 2, 3, 4, 5, 6, 7]

export const Coils = meme(() => {
  const type = useSectionType()
  const length = useClientZustand((z) => selectedUnit(z).sections[type].length)
  const registerConfigAddress = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const address = useValueInputZustand((z) => z.address)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)

  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    const { registerData } = getShownSection()
    valueInputZustand.initCoils(seedCoils(registerData, registerConfigAddress, length))
  }, [length, registerConfigAddress])

  // What the picker draws is what one FC15 writes: from the coil pressed to the
  // end of the read window, and at most `COILS_PER_WRITE` of them.
  const drawn = useMemo(
    () => Math.min(registerConfigAddress + length - address, COILS_PER_WRITE),
    [address, length, registerConfigAddress]
  )

  // Rows start on a multiple of eight, so the labels read 0, 8, 16, and a
  // coil sits under the offset it has in its row.
  const firstRow = Math.floor(address / 8) * 8
  const rowStarts = useMemo(() => {
    const starts: number[] = []
    for (let start = firstRow; start < address + drawn; start += 8) starts.push(start)
    return starts
  }, [firstRow, address, drawn])

  if (coilFunction === 5) return null

  // Eight cells a row, each as wide as the next. The coils before the one the
  // dialog opened on, and past what one request writes, leave their cells
  // empty, and the width is the same for coil 6 as for coil 65524.
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: `${ADDRESS_WIDTH + 8}px repeat(8, 28px)`,
        gap: 0.5,
        alignItems: 'center'
      }}
    >
      <Box />
      {OFFSETS.map((offset) => (
        <Box
          key={`offset_${offset}`}
          sx={{
            fontFamily: 'monospace',
            fontSize: 10,
            color: 'text.disabled',
            textAlign: 'center'
          }}
        >
          +{offset}
        </Box>
      ))}
      {rowStarts.flatMap((start) => [
        <Box
          key={`coil_row_${start}`}
          data-testid={`write-coil-row-${start}`}
          sx={{ ...addressLabel, width: 'auto', pr: 1 }}
        >
          {start}
        </Box>,
        ...OFFSETS.map((offset) => {
          const coilAddress = start + offset
          return coilAddress >= address && coilAddress < address + drawn ? (
            <CoilButton
              key={`coil_${coilAddress}`}
              address={coilAddress}
              index={coilAddress - registerConfigAddress}
            />
          ) : (
            <Box key={`coil_${coilAddress}`} />
          )
        })
      ])}
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
  const handleClose = useCallback(() => {
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.resetValue()
    onClose()
  }, [onClose])

  useEffect(() => {
    const valueInputZustand = useValueInputZustand.getState()
    valueInputZustand.setAddress(address)
    // ! deliberate only once when the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A popover places itself when it opens. FC15 grows the coil picker after
  // that, so the change of function code asks it to place itself again.
  // Measured with motion on: from coil 22 the picker ran to 1160px in a 972px
  // window. With reduced motion, as the e2e suite runs, it did not.
  const popoverActions = useRef<PopoverActions>(null)
  const coilFunction = useValueInputZustand((z) => z.coilFunction)
  useEffect(() => {
    popoverActions.current?.updatePosition()
  }, [coilFunction])

  // To the left of the action cell, top edges level, moved back inside the
  // window where the content would run off its edge.
  return (
    <Popover
      action={popoverActions}
      open={open}
      onClose={handleClose}
      anchorEl={actionCellRef.current}
      anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: { sx: { display: 'flex', alignItems: 'center', padding: 1, gap: 1 } }
      }}
    >
      {type === 'holding_registers' ? (
        <>
          <DataTypeSelect address={address} />
          <ValueInputComponent address={address} />
          <WriteRegistersButton />
        </>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <CoilFunctionSelect />
          <Coils />
        </Box>
      )}
    </Popover>
  )
})

export default WriteModal
