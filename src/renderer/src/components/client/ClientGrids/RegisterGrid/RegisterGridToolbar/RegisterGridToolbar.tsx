import DragIndicator from '@mui/icons-material/DragIndicator'
import Box from '@mui/material/Box'
import { meme } from '@renderer/components/shared/inputs/meme'
import { gridSurface } from '@renderer/theme'
import ReadButton from './ReadButton'
import ReadWindowButton, { READ_WINDOW_TOGGLE } from './ReadWindowButton'
import { atOrBelow, BREAKPOINTS } from '../../breakpoints'
import SectionPollSwitch from './SectionPollSwitch'
import RegisterConfig, {
  REGISTER_TYPE_COLORS,
  REGISTER_TYPE_LABELS
} from '@renderer/components/client/RegisterConfig/RegisterConfig'
import ClearFiltersButton from './ClearFiltersButton'
import { useSectionType } from '../../sectionType'
import { openTypesOf, useClientZustand } from '@renderer/context/client.zustand'
import { useDraggable } from '@dnd-kit/core'
import { useLiveZustand, dataOf } from '@renderer/context/live.zustand'

/**
 * The head of one section: its read window, Read and Raw, the 32 and 64 bit
 * columns and its Poll switch. With more than one type on screen it names its
 * type, and that name is what a drag onto another section picks up.
 */
const RegisterGridToolbar = meme(() => {
  const selectedUuid = useClientZustand((z) => z.selectedUuid)
  const type = useSectionType()
  const several = useClientZustand((z) => openTypesOf(z).length > 1)
  // The drag names the type; `LayoutView` draws what follows the pointer.
  const { setNodeRef, listeners, attributes } = useDraggable({ id: type })
  // Read, the register fields and Clear would each undo a scan that is still
  // running, so the strip goes quiet with the rows underneath it.
  const scanning = useLiveZustand((z) => dataOf(z, selectedUuid).clientState.scanningRegisters)

  return (
    <Box
      sx={(theme) => ({
        ...(scanning && {
          pointerEvents: 'none',
          opacity: theme.palette.action.disabledOpacity
        }),
        height: 40,
        flexShrink: 0,
        boxSizing: 'border-box',
        // The fields are 28px in a 39px strip over its border, so 6px above,
        // below and on the left; the Poll switch has 9px on the right.
        pl: 0.75,
        pr: '9px',
        // The head sits on the section's own surface; the column headers
        // under it take the app background.
        background: gridSurface,
        borderBottom: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        // At the readWindow breakpoint or narrower the read window leaves the head for the menu on
        // Read; wider, the menu's half of the split button is not there.
        containerType: 'inline-size',
        [`& .${READ_WINDOW_TOGGLE}`]: { display: 'none' },
        // A panel this narrow is set aside rather than read from.
        [atOrBelow(BREAKPOINTS.read)]: {
          [`& [data-testid="read-btn"], && .${READ_WINDOW_TOGGLE}`]: { display: 'none' }
        },
        // Where the footer drops its pages, the Poll switch drops its label.
        [atOrBelow(BREAKPOINTS.pages)]: {
          '& .MuiFormControlLabel-label': { display: 'none' }
        },
        [atOrBelow(BREAKPOINTS.readWindow)]: {
          '& .read-window-inline': { display: 'none' },
          // Read and its arrow read as one split button.
          '& [data-testid="read-btn"]': { borderTopRightRadius: 0, borderBottomRightRadius: 0 },
          [`& .${READ_WINDOW_TOGGLE}`]: {
            display: 'inline-flex',
            marginLeft: `-${theme.spacing(1)}`,
            borderLeft: 0,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0
          }
        }
      })}
    >
      {several && (
        <Box
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          title="Drag onto another section to place it there"
          data-testid={`section-title-${type}`}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.25,
            fontSize: 13,
            mr: 0.5,
            cursor: 'grab'
          }}
        >
          <DragIndicator sx={{ fontSize: 16, color: REGISTER_TYPE_COLORS[type] }} />
          {REGISTER_TYPE_LABELS[type]}
        </Box>
      )}
      <Box className="read-window-inline" sx={{ display: 'contents' }}>
        <RegisterConfig />
      </Box>
      <ReadButton />
      <ReadWindowButton />
      <ClearFiltersButton />
      <Box sx={{ flex: 1 }} />
      <SectionPollSwitch />
    </Box>
  )
})

export default RegisterGridToolbar
