import Memory from '@mui/icons-material/Memory'
import Popover from '@mui/material/Popover'
import MoreVert from '@mui/icons-material/MoreVert'
import Divider from '@mui/material/Divider'
import Menu from '@mui/material/Menu'
import { atOrBelow, BREAKPOINTS } from './breakpoints'
import { barSurface } from '@renderer/theme'
import Box from '@mui/material/Box'
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
import LoadDummyDataButton from './RegisterGrid/RegisterGridToolbar/LoadDummyDataButton'
import UnitTabs from './UnitTabs'
import {
  ReadConfiguration,
  RegisterTypeTabs
} from '@renderer/components/client/RegisterConfig/RegisterConfig'
import BitWidthButtons from './RegisterGrid/RegisterGridToolbar/BitWidthButtons'
import {
  layoutOf,
  openTypesOf,
  selectedUnit,
  useClientZustand
} from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { MouseEvent, useCallback, useState } from 'react'

/** What leaves the bar for the ⋮ menu when it narrows, and the button that opens that menu. */
const OVERFLOWS = 'unit-bar-overflows'
const OVERFLOW_MENU = 'unit-bar-overflow-menu'

/** The bar's ⋮ menu, holding what the bar has no room for. */
const OverflowMenu = meme(() => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  return (
    <>
      <IconButton
        className={OVERFLOW_MENU}
        size="small"
        aria-label="More actions"
        data-testid="unit-bar-menu-btn"
        onClick={handleOpen}
      >
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={handleClose}>
        <LoadButton inMenu={handleClose} />
        <SaveButton inMenu={handleClose} />
        <ClearConfigButton inMenu={handleClose} />
        <Divider />
        <ClearButton inMenu={handleClose} />
        <LoadDummyDataButton inMenu={handleClose} />
      </Menu>
    </>
  )
})

/** How values are read and shown, which folds into a menu of its own below the overflow. */
const VALUES = 'unit-bar-values'
const VALUES_MENU = 'unit-bar-values-menu'

/** Byte order and the 32 and 64 bit columns, in a popover when the bar is narrow. */
const ValuesMenu = meme(() => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const handleOpen = useCallback((event: MouseEvent<HTMLElement>) => {
    setAnchor(event.currentTarget)
  }, [])
  const handleClose = useCallback(() => setAnchor(null), [])

  return (
    <>
      <IconButton
        className={VALUES_MENU}
        size="small"
        aria-label="Byte order and bit width"
        data-testid="unit-bar-values-btn"
        onClick={handleOpen}
      >
        <Memory />
      </IconButton>
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.5 } } }}
      >
        <Box sx={{ display: 'flex', gap: 1.25, p: 1 }}>
          <ToggleEndianButton />
          <BitWidthButtons />
        </Box>
      </Popover>
    </>
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
        background: barSurface,
        display: 'flex',
        flexDirection: 'column'
      })}
    >
      <UnitTabs />
      <Box
        sx={{
          display: 'flex',
          gap: 1.25,
          alignItems: 'center',
          p: 0.5,
          pr: 1,
          // The file actions and Dummy Data fold into the ⋮ menu when narrow.
          containerType: 'inline-size',
          [`& .${OVERFLOW_MENU}`]: { display: 'none' },
          [atOrBelow(BREAKPOINTS.unitBarMenu)]: {
            [`& .${OVERFLOWS}`]: { display: 'none' },
            [`& .${OVERFLOW_MENU}`]: { display: 'inline-flex' }
          },
          [`& .${VALUES_MENU}`]: { display: 'none' },
          [atOrBelow(BREAKPOINTS.unitBarValues)]: {
            [`& .${VALUES}`]: { display: 'none' },
            [`& .${VALUES_MENU}`]: { display: 'inline-flex' }
          }
        }}
      >
        <RegisterTypeTabs />
        <ReadConfiguration />
        <Box className={VALUES} sx={{ display: 'flex', gap: 1.25 }}>
          <ToggleEndianButton />
          <BitWidthButtons />
        </Box>
        <ValuesMenu />
        <Box sx={{ flex: 1 }} />
        <Box className={OVERFLOWS} sx={{ display: 'flex' }}>
          <LoadButton />
          <SaveButton />
          <ClearConfigButton />
        </Box>
        <Box className={OVERFLOWS} sx={{ display: 'flex', gap: 1.25 }}>
          <ClearButton />
          <LoadDummyDataButton />
        </Box>
        {/* The ⋮ sits in with the layout buttons, with no gap between. */}
        <Box sx={{ display: 'flex' }}>
          <StackButtons />
          <OverflowMenu />
        </Box>
      </Box>
    </Box>
  )
})

export default ClientGridBar
