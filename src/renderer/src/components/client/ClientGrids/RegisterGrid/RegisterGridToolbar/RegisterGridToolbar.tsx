import Box from '@mui/material/Box'
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
import { openTypesOf, useClientZustand } from '@renderer/context/client.zustand'
import { SECTION_DRAG_TYPE, SectionDragContext } from '../../LayoutView'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'
import { DragEvent, useCallback, useContext } from 'react'

/**
 * The head of one section: its read window, Read and Raw, the 32 and 64 bit
 * columns and its Poll switch. With more than one type on screen it names its
 * type, and that name is what a drag onto another section picks up.
 */
const RegisterGridToolbar = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const type = useSectionType()
  const several = useClientZustand((z) => openTypesOf(z).length > 1)
  const { setDragging } = useContext(SectionDragContext)
  // Read, the register fields and Clear would each undo a scan that is still
  // running, so the strip goes quiet with the rows underneath it.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  const handleDragStart = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(SECTION_DRAG_TYPE, type)
      event.dataTransfer.effectAllowed = 'move'
      setDragging(type)
    },
    [setDragging, type]
  )
  const handleDragEnd = useCallback(() => setDragging(undefined), [setDragging])

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
      {several && (
        <Box
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          title="Drag onto another section to place it there"
          data-testid={`section-title-${type}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            fontSize: 13,
            mr: 0.5,
            cursor: 'grab'
          }}
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
    </Box>
  )
})

export default RegisterGridToolbar
