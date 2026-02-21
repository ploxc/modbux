import {
  InputBaseComponentProps,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material'
import { useRootZustand } from '@renderer/context/root.zustand'
import { MaskSetFn } from '@renderer/context/root.zustand.types'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from './types'
import UIntInput from './UintInput'

interface AddressBaseInputProps {
  disabled?: boolean
  address: number
  setAddress: MaskSetFn
  testId: string
  baseTestId: string
}

const AddressBaseInput = ({
  disabled,
  address,
  setAddress,
  testId,
  baseTestId
}: AddressBaseInputProps): JSX.Element => {
  const addressBase = useRootZustand((z) => z.registerConfig.addressBase)
  const setAddressBase = useRootZustand((z) => z.setAddressBase)

  const base = Number(addressBase)
  const displayValue = String(address + base)

  const handleSetAddress = useCallback(
    (v: string) => setAddress(String(Math.max(0, Number(v) - base))),
    [setAddress, base]
  )

  return (
    <TextField
      disabled={disabled}
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 110, '& .MuiInputBase-root': { pr: 0 } }}
      value={displayValue}
      data-testid={testId}
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: handleSetAddress, max: 65535 + base }),
          endAdornment: (
            <ToggleButtonGroup
              disabled={disabled}
              size="small"
              exclusive
              color="primary"
              value={addressBase}
              onChange={(_, v) => v !== null && setAddressBase(v)}
            >
              <ToggleButton
                value={'0'}
                data-testid={`${baseTestId}-0-btn`}
                aria-label="Address base 0"
              >
                0
              </ToggleButton>
              <ToggleButton
                value={'1'}
                data-testid={`${baseTestId}-1-btn`}
                aria-label="Address base 1"
              >
                1
              </ToggleButton>
            </ToggleButtonGroup>
          )
        }
      }}
    />
  )
}

export default AddressBaseInput
