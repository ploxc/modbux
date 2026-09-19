import List from '@mui/icons-material/List'
import Box from '@mui/material/Box'
import FormControl from '@mui/material/FormControl'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import LengthInput from '@renderer/components/shared/inputs/LengthInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { useDataZustand } from '@renderer/context/data.zustand'
import { flushRegisterMappingToMain, useClientZustand } from '@renderer/context/client.zustand'
import { maxReadQuantity, registersFrom, RegisterType } from '@shared'
import { showMapping } from '@renderer/context/data.zustand'
import { ElementType, useCallback, useEffect, useRef } from 'react'

// Protocol
const TypeSelect = meme(() => {
  const labelId = 'register-type-select'
  const type = useClientZustand((z) => z.registerConfig.type)

  const handleChange = useCallback((type: RegisterType) => {
    if (!useClientZustand.getState().readConfiguration) {
      useDataZustand.getState().setRegisterData([])
    }
    useClientZustand.getState().setType(type)
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
  const address = useClientZustand((z) => z.registerConfig.address)
  const readConfiguration = useClientZustand((z) => z.readConfiguration)

  const setAddress = useClientZustand.getState().setAddress

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
  const length = useClientZustand((z) => String(z.registerConfig.length))
  const lengthValid = useClientZustand((z) => z.valid.length)
  const address = useClientZustand((z) => z.registerConfig.address)
  const type = useClientZustand((z) => z.registerConfig.type)
  const readConfiguration = useClientZustand((z) => z.readConfiguration)

  const setLength = useClientZustand.getState().setLength

  // Both ceilings a read has: what one response carries, by register type, and
  // how many registers are left from the address. `LengthInput` held the first
  // at 125 whatever it was passed, so a coil read stopped at 125 of the 2000
  // FC01 answers.
  const max = Math.min(maxReadQuantity([type]), registersFrom(address))

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
          inputProps: maskInputProps({ set: setLength, max })
        }
      }}
    />
  )
})

const ReadConfiguration = meme(() => {
  const readConfiguration = useClientZustand((z) => !!z.readConfiguration)

  // The store is written once main has the mapping, so between the press and
  // that answer the toggle still reads off and a second press arrives as one
  // more turn-on: a second flush, a second `showMapping` and a second read.
  const handingOver = useRef(false)

  const handleChange = useCallback(async (_: React.MouseEvent, v: boolean | null) => {
    const toggleState = !!v

    // Turning it on hands main the mapping and then asks it to read out of that
    // mapping, so a refusal here would read out of the one before it. Turning it
    // off asks main for nothing.
    if (toggleState) {
      if (handingOver.current) return
      handingOver.current = true
      try {
        const { registerMapping } = useClientZustand.getState()
        if (!(await flushRegisterMappingToMain(registerMapping))) return
        showMapping()
      } finally {
        handingOver.current = false
      }
    }
    useClientZustand.getState().setReadConfiguration(toggleState)
  }, [])

  // The same question `showMapping` and `groupAddressInfos` ask: an entry with
  // no data type configures nothing to read. Counting keys instead put the
  // button on a mapping that carries only comments, and pressing it there
  // emptied the grid and disabled the address and length fields. A bit type
  // reaches that first, because the grid mounts the data type column for input
  // and holding registers alone and a comment is all it writes into a coil.
  const nothingConfigured = useClientZustand((z) =>
    Object.values(z.registerMapping[z.registerConfig.type]).every(
      (entry) => !entry?.dataType || entry.dataType === 'none'
    )
  )

  // Turning it on asks main to read, and main refuses a read while one is in
  // flight. The toggle goes off for as long as that lasts, rather than taking a
  // press that answers with a warning.
  const reading = useClientZustand((z) => z.clientState.reading)
  const disabled = nothingConfigured || reading

  // A mapping with nothing to read turns it off. A read in flight does not:
  // that greys the button for a moment, and turning it off would empty the grid
  // the read is about to fill.
  useEffect(() => {
    if (!nothingConfigured) return
    const clientZustand = useClientZustand.getState()
    if (clientZustand.readConfiguration) clientZustand.setReadConfiguration(false)
  }, [nothingConfigured])

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
