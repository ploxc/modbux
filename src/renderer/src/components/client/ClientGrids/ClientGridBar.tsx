import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import VerticalSplit from '@mui/icons-material/VerticalSplit'
import { meme } from '@renderer/components/shared/inputs/meme'
import ToggleEndianButton from './RegisterGrid/RegisterGridToolbar/ToggleEndianButton'
import LoadButton from './RegisterGrid/RegisterGridToolbar/LoadButton'
import SaveButton from './RegisterGrid/RegisterGridToolbar/SaveButton'
import ClearConfigButton from './RegisterGrid/RegisterGridToolbar/ClearConfigButton'
import ClearButton from './RegisterGrid/RegisterGridToolbar/ClearButton'
import ShowLogButton from './RegisterGrid/RegisterGridToolbar/ShowLogButton'
import MenuButton from './RegisterGrid/RegisterGridToolbar/MenuButton/MenuButton'
import UnitTabs from './UnitTabs'
import { RegisterTypeTabs } from '@renderer/components/client/RegisterConfig/RegisterConfig'
import { useClientZustand, selectedClient, selectedSession } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
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
      sx={{ flex: 1, minWidth: 80 }}
      size="small"
      color="primary"
      placeholder="Client Configuration Name"
      value={name}
      onChange={handleChange}
    />
  )
})

/** Two register types side by side, or one. */
const SideBySideButton = meme(() => {
  const sideBySide = useClientZustand((z) => selectedSession(z).openTypes.length > 1)

  const handleChange = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.setSideBySide(selectedSession(clientZustand).openTypes.length < 2)
  }, [])

  return (
    <ToggleButton
      value="side-by-side"
      size="small"
      selected={sideBySide}
      onChange={handleChange}
      aria-label="Register types side by side"
      data-testid="side-by-side-btn"
    >
      <VerticalSplit sx={{ fontSize: 18 }} />
    </ToggleButton>
  )
})

/**
 * What every section of the client on screen shares: its units, the register
 * types on screen, and the configuration.
 */
const ClientGridBar = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  // The configuration buttons would each undo a scan that is still running.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  return (
    <Box
      sx={(theme) => ({
        ...(scanning && {
          pointerEvents: 'none',
          opacity: theme.palette.action.disabledOpacity
        }),
        background: theme.palette.background.default,
        borderBottom: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column'
      })}
    >
      <UnitTabs />
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', px: 1.5, py: 1 }}>
        <RegisterTypeTabs />
        <SideBySideButton />
        <Box sx={{ flex: 1 }} />
        <ToggleEndianButton />
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

export default ClientGridBar
