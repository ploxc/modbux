import { lineColor, textBright, textMuted } from '@renderer/theme'
import { useSectionType } from '@renderer/components/client/ClientGrids/sectionType'
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
  flushUnitsToMain,
  getSelectedClient,
  readsConfiguration,
  selectedClientUuid,
  selectedUnit,
  openTypesOf
} from '@renderer/context/client.zustand'
import {
  clientOwner,
  configuredReadGroups,
  maxReadQuantity,
  registersFrom,
  RegisterType,
  RegisterTypeSchema
} from '@shared'
import { showShownMapping } from '@renderer/context/live.zustand'
import { ElementType, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLogEnabled } from '@renderer/components/client/Logging/useLogEnabled'

// Register type
const REGISTER_TYPES: { type: RegisterType; label: string; color: string }[] = [
  { type: 'holding_registers', label: 'Holding', color: '#7fb59b' },
  { type: 'input_registers', label: 'Input', color: '#8fb0dd' },
  { type: 'coils', label: 'Coils', color: '#e0b36a' },
  { type: 'discrete_inputs', label: 'Discrete', color: '#c49bd6' }
]

/** The colour each register type is marked with, on its button and its section. */
export const REGISTER_TYPE_COLORS = Object.fromEntries(
  REGISTER_TYPES.map(({ type, color }) => [type, color])
) as Record<RegisterType, string>

/** What each register type is called on its button and its section. */
export const REGISTER_TYPE_LABELS = Object.fromEntries(
  REGISTER_TYPES.map(({ type, label }) => [type, label])
) as Record<RegisterType, string>

/**
 * One button per register type of the unit on screen, pressed while the type
 * is shown. Pressing one turns it on or off; the last one on stays.
 */
export const RegisterTypeTabs = meme(() => {
  const openList = useClientZustand((z) => openTypesOf(z).join(','))
  const openTypes = useMemo(() => openList.split(',') as RegisterType[], [openList])

  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // A register scan reads the type once, for the chunk size one response
  // carries, and `_scanRegister` reads it again for every chunk.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const handleChange = useCallback(
    (_event: unknown, next: RegisterType[]) => {
      const [pressed] = [
        ...next.filter((type) => !openTypes.includes(type)),
        ...openTypes.filter((type) => !next.includes(type))
      ]
      if (pressed) useClientZustand.getState().setType(pressed)
    },
    [openTypes]
  )

  return (
    <ToggleButtonGroup
      disabled={scanning}
      size="medium"
      value={openTypes}
      onChange={handleChange}
      aria-label="Register type"
      // A segmented control on its own dark track, as the canvas draws it.
      sx={(theme) => ({
        p: '2px',
        gap: '2px',
        borderRadius: '6px',
        background: theme.palette.background.paper,
        '& .MuiToggleButtonGroup-grouped': {
          border: 0,
          borderRadius: '4px',
          margin: 0,
          color: textMuted,
          fontSize: 13,
          '&.Mui-selected, &.Mui-selected:hover': { background: lineColor, color: textBright }
        }
      })}
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
  const type = useSectionType()
  const address = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const readConfiguration = useClientZustand((z) => readsConfiguration(z))

  // The section's own type, because the field reports its value when it mounts.
  const setAddress = useCallback(
    (value: string, valid?: boolean) => useClientZustand.getState().setAddress(value, valid, type),
    [type]
  )

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
  const type = useSectionType()
  const length = useClientZustand((z) => selectedUnit(z).sections[type].length)
  const address = useClientZustand((z) => selectedUnit(z).sections[type].address)
  const readConfiguration = useClientZustand((z) => readsConfiguration(z))

  // The section's own type, because the field reports its value when it mounts.
  const setLength = useCallback(
    (value: string, valid?: boolean) => useClientZustand.getState().setLength(value, valid, type),
    [type]
  )

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
      value={String(length)}
      data-testid="reg-length-input"
      error={length === 0}
      slotProps={{
        input: {
          inputComponent: LengthInput as unknown as ElementType<InputBaseComponentProps, 'input'>,
          inputProps: maskInputProps({ set: setLength, max })
        }
      }}
    />
  )
})

/** Shows the mapping for every register type of the unit, so it sits in the unit's bar. */
export const ReadConfiguration = meme(() => {
  const readConfiguration = useClientZustand((z) => readsConfiguration(z))

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
        if (!(await flushUnitsToMain(selectedClientUuid(), getSelectedClient().units))) return
        showShownMapping()
      } finally {
        handingOver.current = false
      }
    }
    useClientZustand.getState().setReadConfiguration(toggleState)
  }, [])

  // The question `_polledTypes` asks of a unit under read configuration: a
  // type the mapping has a group for. Counting keys instead put the button on
  // a mapping that carries only comments, and pressing it emptied the grid and
  // disabled the address and length fields. A bit with a comment is a group.
  const nothingConfigured = useClientZustand((z) => {
    const { registerMapping } = selectedUnit(z)
    return RegisterTypeSchema.options.every(
      (type) => configuredReadGroups(true, type, registerMapping).length === 0
    )
  })

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
  // While logging it stays on: Debug shows Monitor's reads, which are groups.
  const logEnabled = useLogEnabled()
  const disabled = nothingConfigured || owner !== undefined || (logEnabled && readConfiguration)

  // A mapping with nothing to read turns it off. A read in flight does not:
  // that greys the button for a moment, and turning it off would empty the grid
  // the read is about to fill.
  useEffect(() => {
    if (!nothingConfigured) return
    if (readsConfiguration(useClientZustand.getState())) {
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
      title={
        logEnabled
          ? 'On while the client logs: Debug shows what Monitor reads'
          : 'Read all registers configured with a data type, and all bits with a comment'
      }
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
    </>
  )
})

export default RegisterConfig
