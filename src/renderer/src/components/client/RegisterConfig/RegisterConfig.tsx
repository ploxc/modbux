import { List } from '@mui/icons-material'
import {
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  TextField,
  Box,
  ToggleButtonGroup,
  ToggleButton,
  InputBaseComponentProps
} from '@mui/material'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import LengthInput from '@renderer/components/shared/inputs/LengthInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { RegisterType } from '@shared'
import { showMapping } from '@renderer/context/data.zustand'
import { ElementType, useCallback, useEffect } from 'react'

// Protocol
const TypeSelect = meme(() => {
  const labelId = 'register-type-select'
  const type = useRootZustand((z) => z.registerConfig.type)

  const handleChange = useCallback((type: RegisterType) => {
    if (!useRootZustand.getState().readConfiguration) {
      useDataZustand.getState().setRegisterData([])
    }
    useRootZustand.getState().setType(type)
  }, [])

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={type}
        label="Type"
        onChange={(e) => handleChange(e.target.value as RegisterType)}
        data-testid="reg-type-select"
      >
        <MenuItem value={'coils'}>Coils</MenuItem>
        <MenuItem value={'discrete_inputs'}>Discrete Inputs</MenuItem>
        <MenuItem value={'input_registers'}>Input Registers</MenuItem>
        <MenuItem value={'holding_registers'}>Holding Registers</MenuItem>
      </Select>
    </FormControl>
  )
})

//
//
// Address
const Address = meme(() => {
  const address = useRootZustand((z) => z.registerConfig.address)
  const setAddress = useRootZustand((z) => z.setAddress)
  const readConfiguration = useRootZustand((z) => z.readConfiguration)

  return (
    <AddressBaseInput
      disabled={readConfiguration}
      address={address}
      setAddress={setAddress}
      testId="reg-address-input"
      baseTestId="reg-base"
    />
  )
})

//
//
// Length
const Length = meme(() => {
  const length = useRootZustand((z) => String(z.registerConfig.length))
  const lengthValid = useRootZustand((z) => z.valid.lenght)
  const setLength = useRootZustand((z) => z.setLength)
  const address = useRootZustand((z) => z.registerConfig.address)
  const readConfiguration = useRootZustand((z) => z.readConfiguration)

  return (
    <TextField
      disabled={readConfiguration}
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={length}
      data-testid="reg-length-input"
      error={!lengthValid}
      slotProps={{
        input: {
          inputComponent: LengthInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setLength, max: 65536 - address })
        }
      }}
    />
  )
})

const ReadConfiguration = meme(() => {
  const readConfiguration = useRootZustand((z) => !!z.readConfiguration)
  const handleChange = useCallback((_: React.MouseEvent, v: boolean | null) => {
    const toggleState = !!v

    // When read configuration is enabled, send the configuration to the backend API
    // and immediately show the configured registers in the grid
    if (toggleState) {
      window.api.setRegisterMapping(useRootZustand.getState().registerMapping)
      showMapping()
    }
    useRootZustand.getState().setReadConfiguration(toggleState)
  }, [])

  const disabled = useRootZustand(
    (z) => Object.keys(z.registerMapping[z.registerConfig.type]).length === 0
  )

  useEffect(() => {
    if (!disabled) return
    const state = useRootZustand.getState()
    if (disabled && state.readConfiguration) state.setReadConfiguration(false)
  }, [disabled])

  return (
    <ToggleButtonGroup
      disabled={disabled}
      color="primary"
      size="small"
      exclusive
      value={readConfiguration}
      onChange={handleChange}
      title="Read all registers that have been configured with a data type"
    >
      <ToggleButton
        value={true}
        data-testid="reg-read-config-btn"
        aria-label="Read all configured registers"
      >
        <List />
      </ToggleButton>
    </ToggleButtonGroup>
  )
})

const RegisterConfig = meme(() => {
  return (
    <>
      <TypeSelect />
      <Box sx={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
        <Address />
        <Length />
        <ReadConfiguration />
      </Box>
    </>
  )
})

export default RegisterConfig
