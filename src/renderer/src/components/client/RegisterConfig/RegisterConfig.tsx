import List from '@mui/icons-material/List'
import Box from '@mui/material/Box'
import { InputBaseComponentProps } from '@mui/material/InputBase'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import AddressBaseInput from '@renderer/components/shared/inputs/AddressBaseInput'
import LengthInput from '@renderer/components/shared/inputs/LengthInput'
import { meme } from '@renderer/components/shared/inputs/meme'
import { maskInputProps } from '@renderer/components/shared/inputs/types'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
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
import { showMapping } from '@renderer/context/live.zustand'
import { ElementType, useCallback, useEffect, useRef } from 'react'

// Register type
const REGISTER_TYPES: { type: RegisterType; label: string; color: string }[] = [
  { type: 'holding_registers', label: 'Holding', color: '#7fb59b' },
  { type: 'input_registers', label: 'Input', color: '#8fb0dd' },
  { type: 'coils', label: 'Coils', color: '#e0b36a' },
  { type: 'discrete_inputs', label: 'Discrete', color: '#c49bd6' }
]

export const RegisterTypeTabs = meme(() => {
  const type = useClientZustand((z) => selectedClient(z).registerConfig.type)

  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // A register scan reads this field once, for the chunk size one response
  // carries, and `_scanRegister` reads it again for every chunk. Changing it
  // between the two asks a device for 2000 holding registers.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const handleChange = useCallback((_event: unknown, value: RegisterType | null) => {
    if (value === null) return
    if (!getSelectedSession().readConfiguration) {
      useLiveZustand.getState().setRegisterData(selectedClientUuid(), [])
    }
    useClientZustand.getState().setType(value)
  }, [])

  return (
    <ToggleButtonGroup
      disabled={scanning}
      size="medium"
      exclusive
      value={type}
      onChange={handleChange}
      aria-label="Register type"
    >
      {REGISTER_TYPES.map(({ type: option, label, color }) => (
        <ToggleButton
          key={option}
          value={option}
          data-testid={`reg-type-${option}-btn`}
          sx={{ gap: 0.75, px: 1.5 }}
        >
          <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          {label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
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
      size="medium"
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
      size="medium"
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

  const selectedUuid = useClientZustand((z) => z.selectedUuid)
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
  const owner = useLiveZustand((z) =>
    clientOwner(dataOf(z, selectedUuid).clientState, { exceptPolling: true })
  )
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
      size="medium"
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
      <Address />
      <Length />
      <ReadConfiguration />
    </>
  )
})

export default RegisterConfig
