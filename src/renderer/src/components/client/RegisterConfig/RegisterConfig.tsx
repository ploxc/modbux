import { List } from '@mui/icons-material'
import {
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  TextField,
  Box,
  Tooltip,
  Paper,
  Typography,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
  InputBaseComponentProps
} from '@mui/material'
import LengthInput from '@renderer/components/shared/inputs/LengthInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import UIntInput from '@renderer/components/shared/inputs/UintInput'
import { useDataZustand } from '@renderer/context/data.zustand'
import { useRootZustand } from '@renderer/context/root.zustand'
import { getConventionalAddress, RegisterType } from '@shared'
import { ElementType, useCallback, useEffect, useMemo } from 'react'

// Protocol
const TypeSelect = meme(() => {
  const labelId = 'register-type-select'
  const type = useRootZustand((z) => z.registerConfig.type)

  const handleChange = useCallback((type: RegisterType) => {
    useDataZustand.getState().setRegisterData([])
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
  const address = useRootZustand((z) => String(z.registerConfig.address))
  const length = useRootZustand((z) => z.registerConfig.length)
  const type = useRootZustand((z) => z.registerConfig.type)
  const setAddress = useRootZustand((z) => z.setAddress)
  const addressBase = useRootZustand((z) => z.registerConfig.addressBase)
  const setAddressBase = useRootZustand((z) => z.setAddressBase)
  const readConfiguration = useRootZustand((z) => z.registerConfig.readConfiguration)

  const showConventionalAddress = useMemo(() => {
    return Number(address) + length < 10000
  }, [address, length])

  return (
    <TextField
      disabled={readConfiguration}
      label="Address"
      variant="outlined"
      size="small"
      data-testid="reg-address-input"
      sx={{ width: showConventionalAddress ? 160 : 110, '& .MuiInputBase-root': { pr: 0 } }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setAddress }),
          endAdornment: (
            <Box
              sx={(theme) => ({
                color: theme.palette.primary.light,
                display: 'flex',
                alignItems: 'center',
                gap: 1
              })}
            >
              {showConventionalAddress && (
                <Tooltip
                  arrow
                  slotProps={{
                    tooltip: {
                      sx: {
                        p: 0,
                        background: 'transparent',
                        fontSize: 'inherit',
                        width: '100%',
                        maxWidth: 400
                      }
                    }
                  }}
                  title={
                    <Paper sx={{ px: 3, py: 2, width: '100%%' }}>
                      <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                        This value only serves as a visual reference!
                      </Typography>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="h6">Address Naming Convention</Typography>
                      <Typography variant="overline">(starting from 0)</Typography>
                      <ul>
                        <li>
                          <strong>Coils</strong>: 0 - 9999
                        </li>
                        <li>
                          <strong>Discrete Inputs</strong>: 10000 - 19999
                        </li>
                        <li>
                          <strong>Input Registers</strong>: 30000 - 39999
                        </li>
                        <li>
                          <strong>Holding Registers</strong>: 40000 - 49999
                        </li>
                      </ul>
                      <Typography variant="body1">
                        Each register type in Modbus can theoretically address up to 65,536
                        locations (0 - 65535). The numbering convention (e.g., 40000/40001 for
                        holding registers) is commonly used in documentation but doesn{`'`}t always
                        match the internal Modbus protocol addresses. For example, a holding
                        register at address 0 in Modbus might be referred to as 40000 or 40001 by
                        some manufacturers, while others may use 0 directly. The actual addressing
                        and naming depend on the manufacturer{`'`}s implementation.
                      </Typography>
                    </Paper>
                  }
                >
                  <Box>{getConventionalAddress(type, address, addressBase)}</Box>
                </Tooltip>
              )}
              <ToggleButtonGroup
                size="small"
                exclusive
                color="primary"
                value={addressBase}
                onChange={(_, v) => v !== null && setAddressBase(v)}
              >
                <ToggleButton value={'0'} data-testid="reg-base-0-btn" aria-label="Address base 0">
                  0
                </ToggleButton>
                <ToggleButton value={'1'} data-testid="reg-base-1-btn" aria-label="Address base 1">
                  1
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )
        }
      }}
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
  const readConfiguration = useRootZustand((z) => z.registerConfig.readConfiguration)

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
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
})

const ReadConfiguration = meme(() => {
  const readConfiguration = useRootZustand((z) => !!z.registerConfig.readConfiguration)
  const handleChange = useCallback((_: React.MouseEvent, v: boolean | null) => {
    const toggleState = !!v

    // When read configuration is enabled, send the configuration to the backend API
    if (toggleState) window.api.setRegisterMapping(useRootZustand.getState().registerMapping)
    useRootZustand.getState().setReadConfiguration(toggleState)
  }, [])

  const disabled = useRootZustand(
    (z) => Object.keys(z.registerMapping[z.registerConfig.type]).length === 0
  )

  useEffect(() => {
    if (!disabled) return
    const state = useRootZustand.getState()
    if (disabled && state.registerConfig.readConfiguration) state.setReadConfiguration(false)
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
