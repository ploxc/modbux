import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useClientZustand } from '@renderer/context/client.zustand'
import { MaskSetFn } from '@renderer/context/client.zustand.types'
import { ElementType, useCallback } from 'react'
import { maskInputProps } from './types'
import UIntInput from './UintInput'
import { meme } from './meme'

interface AddressBaseInputProps {
  disabled?: boolean
  address: number
  setAddress: MaskSetFn
  testId: string
  baseTestId: string
}

const AddressBaseInput = meme(
  ({ disabled, address, setAddress, testId, baseTestId }: AddressBaseInputProps): JSX.Element => {
    const addressBase = useClientZustand((z) => z.registerConfig.addressBase)

    const handleBaseChange = useCallback((_event: unknown, value: '0' | '1' | null): void => {
      if (value === null) return
      const clientZustand = useClientZustand.getState()
      clientZustand.setAddressBase(value)
    }, [])

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
                onChange={handleBaseChange}
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
)

export default AddressBaseInput
