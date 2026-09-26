import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import IconButton from '@mui/material/IconButton'
import ViewColumn from '@mui/icons-material/ViewColumn'
import ViewStream from '@mui/icons-material/ViewStream'
import { formatLayout, stackLayout } from '@shared'
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
import {
  layoutOf,
  openTypesOf,
  selectedClient,
  selectedUnit,
  useClientZustand
} from '@renderer/context/client.zustand'
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

/** Every type on screen in one row, or in one column, as a quick action. */
const StackButtons = meme(() => {
  const several = useClientZustand((z) => openTypesOf(z).length > 1)

  const stackRow = useCallback(() => stack('r'), [])
  const stackColumn = useCallback(() => stack('c'), [])

  return (
    <Box sx={{ display: 'flex' }}>
      <IconButton
        size="small"
        disabled={!several}
        onClick={stackRow}
        aria-label="Stack the register types side by side"
        title="Side by side"
        data-testid="layout-row-btn"
      >
        <ViewColumn sx={{ fontSize: 18 }} />
      </IconButton>
      <IconButton
        size="small"
        disabled={!several}
        onClick={stackColumn}
        aria-label="Stack the register types one above the other"
        title="One above the other"
        data-testid="layout-column-btn"
      >
        <ViewStream sx={{ fontSize: 18 }} />
      </IconButton>
    </Box>
  )
})

/** Lays every type of the unit on screen out in one row or one column. */
const stack = (direction: 'r' | 'c'): void => {
  const clientZustand = useClientZustand.getState()
  const layout = layoutOf(selectedUnit(clientZustand))
  clientZustand.setLayout(formatLayout(stackLayout(layout, direction)))
}

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
        <StackButtons />
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
