import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Portal from '@mui/material/Portal'
import { SxProps, Theme } from '@mui/material/styles'
import { DRAG_HANDLE_CLASS } from '@renderer/components/shared/DraggablePopover/DraggablePopover'
import { meme } from '@renderer/components/shared/inputs/meme'
import { KeyboardEvent, ReactNode, SyntheticEvent, useCallback, useRef, useState } from 'react'
import Draggable from 'react-draggable'

interface DraggablePanelProps {
  /** The element whose top right corner the panel opens at. */
  anchor: HTMLElement
  /** Where the panel opens in place of that, in window pixels, given its size. */
  opening?: (width: number, height: number) => { top: number; left: number }
  onClose: () => void
  /** The paper's own style: its size, and `resize` for a corner to drag. */
  paperSx: SxProps<Theme>
  label: string
  children: ReactNode
}

/**
 * A panel that floats over the page and leaves it working: the page keeps
 * its clicks and its focus, and a screen reader still reaches it. The panel
 * drags by its `DRAG_HANDLE_CLASS` element, takes the focus when clicked, and
 * closes on Escape while it holds it. A Popover cannot leave the page so,
 * because its Modal hides every other element of the page from screen
 * readers while it is open, which no prop of MUI 9.3.1's turns off.
 *
 * It opens with its top right corner on the anchor's, or where `opening` puts
 * it, and stays inside the window, a theme spacing unit from its edges, where
 * it is dragged.
 */
const DraggablePanel = meme(
  ({ anchor, opening, onClose, paperSx, label, children }: DraggablePanelProps): JSX.Element => {
    const nodeRef = useRef<HTMLDivElement | null>(null)
    const [place, setPlace] = useState<{ top: number; left: number } | null>(null)

    // Placed once it has a width to place by. The Portal mounts its children a
    // render after its own, so this waits for the paper rather than for a
    // layout effect of the panel's, which ran with no paper to measure.
    const setPaper = useCallback(
      (node: HTMLDivElement | null) => {
        nodeRef.current = node
        if (node === null) return
        const { top, right } = anchor.getBoundingClientRect()
        const opened = opening?.(node.offsetWidth, node.offsetHeight) ?? {
          top,
          left: right - node.offsetWidth
        }
        setPlace((placed) => placed ?? opened)
      },
      [anchor, opening]
    )

    const handleKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Escape') return
        // A panel opened from inside another reaches it through React's tree,
        // portal or not, and closes alone.
        event.stopPropagation()
        onClose()
      },
      [onClose]
    )

    // React hands a press through the portal to every panel around this one,
    // and the handle class it carries starts their drag too.
    const keepPress = useCallback((event: SyntheticEvent) => event.stopPropagation(), [])

    return (
      <Portal>
        <Box
          sx={(theme) => ({
            position: 'fixed',
            inset: 0,
            p: 1,
            pointerEvents: 'none',
            zIndex: theme.zIndex.modal
          })}
        >
          <Box
            onMouseDown={keepPress}
            onTouchStart={keepPress}
            sx={{ position: 'relative', width: '100%', height: '100%' }}
          >
            <Draggable nodeRef={nodeRef} handle={`.${DRAG_HANDLE_CLASS}`} bounds="parent">
              <Paper
                ref={setPaper}
                role="region"
                aria-label={label}
                // A click on it takes the focus, so Escape reaches it.
                tabIndex={-1}
                elevation={8}
                onKeyDown={handleKeyDown}
                sx={[
                  {
                    position: 'absolute',
                    top: (place?.top ?? 0) - 8,
                    left: (place?.left ?? 0) - 8,
                    visibility: place ? 'visible' : 'hidden',
                    pointerEvents: 'auto'
                  },
                  paperSx
                ].flat()}
              >
                {children}
              </Paper>
            </Draggable>
          </Box>
        </Box>
      </Portal>
    )
  }
)

export default DraggablePanel
