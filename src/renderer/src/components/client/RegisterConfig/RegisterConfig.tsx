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
import {
  useClientZustand,
  flushRegisterMappingToMain,
  getSelectedClient,
  getSelectedSession,
  selectedClient,
  selectedClientUuid,
  selectedSession
} from '@renderer/context/client.zustand'
import { clientOwner, maxReadQuantity, registersFrom, RegisterType } from '@shared'
import { showMapping } from '@renderer/context/data.zustand'
import { ElementType, useCallback, useEffect, useRef } from 'react'

// Protocol
const TypeSelect = meme(() => {
  const labelId = 'register-type-select'
  const type = useClientZustand((z) => selectedClient(z).registerConfig.type)

  // A register scan reads this field once, for the chunk size one response
  // carries, and `_scanRegister` reads it again for every chunk. Changing it
  // between the two asks a device for 2000 holding registers. The scan dialog
  // disables every field it owns while it runs; this one sits in the top bar,
  // and what kept it out of reach was the strip the dialog draws over it.
  const scanning = useDataZustand((z) => z.clientState.scanningRegisters)

  const handleChange = useCallback((type: RegisterType) => {
    if (!getSelectedSession().readConfiguration) {
      useDataZustand.getState().setRegisterData([])
    }
    useClientZustand.getState().setType(type)
  }, [])

  return (
    <FormControl size="small">
      <InputLabel id={labelId}>Type</InputLabel>
      <Select
        disabled={scanning}
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
  const address = useClientZustand((z) => selectedClient(z).registerConfig.address)
  const readConfiguration = useClientZustand((z) => selectedSession(z).readConfiguration)

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
  const length = useClientZustand((z) => String(selectedClient(z).registerConfig.length))
  const lengthValid = useClientZustand((z) => selectedSession(z).valid.length)
  const address = useClientZustand((z) => selectedClient(z).registerConfig.address)
  const type = useClientZustand((z) => selectedClient(z).registerConfig.type)
  const readConfiguration = useClientZustand((z) => selectedSession(z).readConfiguration)

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
  const readConfiguration = useClientZustand((z) => !!selectedSession(z).readConfiguration)

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
        const { registerMapping } = getSelectedClient()
        if (!(await flushRegisterMappingToMain(selectedClientUuid(), registerMapping))) return
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
    Object.values(selectedClient(z).registerMapping[selectedClient(z).registerConfig.type]).every(
      (entry) => !entry?.dataType || entry.dataType === 'none'
    )
  )

  // Switching draws the mapping into the grid, or empties it, and a read, a
  // write or a scan that owns the client answers after the switch: its rows
  // then land in a grid about the other question. So the toggle greys for as
  // long as anything owns the client.
  //
  // `exceptPolling`, because a poll is the one owner that fills the grid on
  // its own: `setReadConfiguration` gives main the mapping and the flag, and
  // the next `_read` builds its groups out of both, so the rows arrive within
  // one poll rate with no ask of ours. Asking the whole question greyed the
  // press that turns it off as well, which asks main for nothing at all.
  const owner = useDataZustand((z) => clientOwner(z.clientState, { exceptPolling: true }))
  const disabled = nothingConfigured || owner !== undefined

  // A mapping with nothing to read turns it off. A read in flight does not:
  // that greys the button for a moment, and turning it off would empty the grid
  // the read is about to fill.
  useEffect(() => {
    if (!nothingConfigured) return
    if (getSelectedSession().readConfiguration) {
      useClientZustand.getState().setReadConfiguration(false)
    }
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
