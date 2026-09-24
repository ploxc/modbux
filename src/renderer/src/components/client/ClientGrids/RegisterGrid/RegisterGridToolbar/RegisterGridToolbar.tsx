import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import PollButton from './PollButton'
import ReadButton from './ReadButton'
import ToggleEndianButton from './ToggleEndianButton'
import TimeSettings from './TimeSettings'
import LoadButton from './LoadButton'
import SaveButton from './SaveButton'
import ClearConfigButton from './ClearConfigButton'
import ClearButton from './ClearButton'
import ShowLogButton from './ShowLogButton'
import MenuButton from './MenuButton/MenuButton'
import RawButton from './RawButton'
import ClearFiltersButton from './ClearFiltersButton'
import { useClientZustand, selectedClient } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import TextField from '@mui/material/TextField'
import { ChangeEvent, useCallback } from 'react'

const ClientConfigName = meme(() => {
  const name = useClientZustand((z) => selectedClient(z).name ?? '')

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>): void => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setName(event.target.value)
  }, [])

  return (
    <TextField
      data-testid="client-config-name-input"
      fullWidth
      sx={{ flex: 1, minWidth: 80, height: 28 }}
      slotProps={{ input: { sx: { height: 28, fontSize: 12 } } }}
      size="small"
      color="primary"
      placeholder="Client Configuration Name"
      value={name}
      onChange={handleChange}
    />
  )
})

const RegisterGridToolbar = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // Read, Poll, Clear and the config buttons would each undo a scan that is
  // still running, so the strip goes quiet with the rows underneath it.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  return (
    <Box
      sx={(theme) => ({
        ...(scanning && {
          pointerEvents: 'none',
          opacity: theme.palette.action.disabledOpacity
        }),
        pt: 1,
        px: 1,
        pb: 0.5,
        // The Data Grid renders the toolbar slot bare -- no wrapper, no
        // background -- so it would otherwise show the grid's own base colour.
        // The theme points DataGrid.headerBg at this same value, so the toolbar
        // and the column headers stay one strip. (headerBg cannot be read back
        // here: the augmentation extends PaletteOptions and CssVarsPalette, not
        // Palette.)
        background: theme.palette.background.default,
        display: 'flex',
        //justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 1
      })}
    >
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <PollButton />
        <ReadButton />
        <ToggleEndianButton />
        <TimeSettings />
        <RawButton />
        <ClearFiltersButton />
      </Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flex: 1 }}>
        <Box sx={{ flex: '1 1 0' }}></Box>
        <Box sx={{ display: 'flex' }}>
          <LoadButton />
          <SaveButton />
          <ClearConfigButton />
        </Box>
        <ClientConfigName />
        <ClearButton />
        <ShowLogButton />
        <MenuButton />
      </Box>
    </Box>
  )
})

export default RegisterGridToolbar
