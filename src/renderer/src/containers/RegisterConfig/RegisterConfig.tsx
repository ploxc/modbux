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
  ToggleButton
} from '@mui/material'
import LengthInput from '@renderer/components/LengthInput'
import { maskInputProps } from '@renderer/components/types'
import UIntInput from '@renderer/components/UintInput'
import { useRootZustand } from '@renderer/context/root.zustand'
import { getConventionalAddress, RegisterType } from '@shared'

// Protocol
const TypeSelect = () => {
  const labelId = 'register-type-select'
  const type = useRootZustand((z) => z.registerConfig.type)
  const setType = useRootZustand((z) => z.setType)

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        size="small"
        labelId={labelId}
        value={type}
        label="Type"
        onChange={(e) => setType(e.target.value as RegisterType)}
      >
        <MenuItem value={RegisterType.Coils}>Coils</MenuItem>
        <MenuItem value={RegisterType.DiscreteInputs}>Discrete Inputs</MenuItem>
        <MenuItem value={RegisterType.InputRegisters}>Input Registers</MenuItem>
        <MenuItem value={RegisterType.HoldingRegisters}>Holding Registers</MenuItem>
      </Select>
    </FormControl>
  )
}

//
//
// Address
const Address = () => {
  const address = useRootZustand((z) => String(z.registerConfig.address))
  const type = useRootZustand((z) => z.registerConfig.type)
  const setAddress = useRootZustand((z) => z.setAddress)
  const addressBase = useRootZustand((z) => z.addressBase)
  const setAddressBase = useRootZustand((z) => z.setAddressBase)

  return (
    <TextField
      label="Address"
      variant="outlined"
      size="small"
      sx={{ width: 160, '& .MuiInputBase-root': { pr: 0 } }}
      value={address}
      slotProps={{
        input: {
          inputComponent: UIntInput as any,
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
                      Each register type in Modbus can theoretically address up to 65,536 locations
                      (0 - 65535). The numbering convention (e.g., 40000/40001 for holding
                      registers) is commonly used in documentation but doesn't always match the
                      internal Modbus protocol addresses. For example, a holding register at address
                      0 in Modbus might be referred to as 40000 or 40001 by some manufacturers,
                      while others may use 0 directly. The actual addressing and naming depend on
                      the manufacturer's implementation.
                    </Typography>
                  </Paper>
                }
              >
                <Box>{getConventionalAddress(type, address, addressBase)}</Box>
              </Tooltip>
              <ToggleButtonGroup
                size="small"
                exclusive
                color="primary"
                value={addressBase}
                onChange={(_, v) => setAddressBase(v)}
              >
                <ToggleButton value={'0'}>0</ToggleButton>
                <ToggleButton value={'1'}>1</ToggleButton>
              </ToggleButtonGroup>
            </Box>
          )
        }
      }}
    />
  )
}

//
//
// Length
const Length = () => {
  const length = useRootZustand((z) => String(z.registerConfig.length))
  const lengthValid = useRootZustand((z) => z.valid.lenght)
  const setLength = useRootZustand((z) => z.setLength)

  return (
    <TextField
      label="Length"
      variant="outlined"
      size="small"
      sx={{ width: 60 }}
      value={length}
      error={!lengthValid}
      slotProps={{
        input: {
          inputComponent: LengthInput as any,
          inputProps: maskInputProps({ set: setLength })
        }
      }}
    />
  )
}

const RegisterConfig = () => {
  return (
    <>
      <TypeSelect />
      <Box sx={{ display: 'flex', gap: 2, marginRight: 'auto' }}>
        <Address />
        <Length />
      </Box>
    </>
  )
}
export default RegisterConfig
