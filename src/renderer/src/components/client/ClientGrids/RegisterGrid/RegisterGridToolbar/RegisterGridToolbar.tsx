import Close from '@mui/icons-material/Close'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import { meme } from '@renderer/components/shared/inputs/meme'
import ReadButton from './ReadButton'
import BitWidthButtons from './BitWidthButtons'
import SectionPollSwitch from './SectionPollSwitch'
import RegisterConfig, {
  REGISTER_TYPE_COLORS,
  REGISTER_TYPE_LABELS
} from '@renderer/components/client/RegisterConfig/RegisterConfig'
import RawButton from './RawButton'
import ClearFiltersButton from './ClearFiltersButton'
import { useSectionType } from '../../sectionType'
import { useClientZustand, selectedSession } from '@renderer/context/client.zustand'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { useCallback } from 'react'

/**
 * The head of one section: its read window, Read and Raw, the 32 and 64 bit
 * columns and its Poll switch. With two types side by side it names its type
 * and can be closed.
 */
const RegisterGridToolbar = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const type = useSectionType()
  const sideBySide = useClientZustand((z) => selectedSession(z).openTypes.length > 1)
  // Read, the register fields and Clear would each undo a scan that is still
  // running, so the strip goes quiet with the rows underneath it.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const handleClose = useCallback(() => {
    const clientZustand = useClientZustand.getState()
    clientZustand.closeType(type)
  }, [type])

  return (
    <Box
      sx={(theme) => ({
        ...(scanning && {
          pointerEvents: 'none',
          opacity: theme.palette.action.disabledOpacity
        }),
        py: 1,
        px: 1.5,
        // The Data Grid renders the toolbar slot bare -- no wrapper, no
        // background -- so it would otherwise show the grid's own base colour.
        // The theme points DataGrid.headerBg at this same value, so the toolbar
        // and the column headers stay one strip. (headerBg cannot be read back
        // here: the augmentation extends PaletteOptions and CssVarsPalette, not
        // Palette.)
        background: theme.palette.background.default,
        display: 'flex',
        gap: 1,
        alignItems: 'center'
      })}
    >
      {sideBySide && (
        <Box
          data-testid={`section-title-${type}`}
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75, fontSize: 13, mr: 0.5 }}
        >
          <Box
            sx={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: REGISTER_TYPE_COLORS[type]
            }}
          />
          {REGISTER_TYPE_LABELS[type]}
        </Box>
      )}
      <RegisterConfig />
      <ReadButton />
      <RawButton />
      <ClearFiltersButton />
      <Box sx={{ flex: 1 }} />
      <BitWidthButtons />
      <SectionPollSwitch />
      {sideBySide && (
        <IconButton
          size="small"
          aria-label="Close this register type"
          data-testid={`section-close-${type}`}
          onClick={handleClose}
        >
          <Close sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Box>
  )
})

export default RegisterGridToolbar
