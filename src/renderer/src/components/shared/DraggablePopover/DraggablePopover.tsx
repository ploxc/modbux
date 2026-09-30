import Popover, { PopoverOrigin } from '@mui/material/Popover'
import { SxProps, Theme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { ReactNode, useCallback, useMemo, useState } from 'react'
import DraggablePaper from './DraggablePaper'

export { DRAG_HANDLE_CLASS } from './DraggablePaper'

interface DraggablePopoverProps {
  anchor: HTMLElement | null
  onClose: () => void
  /** The paper's own style: its size, and `resize` for a corner to drag. */
  paperSx: SxProps<Theme>
  /**
   * Leaves the page under it working: no backdrop, clicks outside reach what
   * they land on rather than closing it, and focus stays where it is.
   */
  modeless?: boolean
  /** Where on the anchor it opens, and which of its corners goes there; below the anchor's left edge unless said. */
  anchorOrigin?: PopoverOrigin
  transformOrigin?: PopoverOrigin
  children: ReactNode
}

const ANCHOR_ORIGIN = { vertical: 'bottom', horizontal: 'left' } as const
const PINNED_ORIGIN = { vertical: 'top', horizontal: 'left' } as const

/**
 * A popover that opens below its anchor and then stays where it was dragged.
 *
 * Once it has opened it is pinned to the position Popover gave it, because
 * Popover places itself again from its anchor on a window resize, which would
 * throw away a drag. The children render inside it, so state they keep
 * renders them alone: Popover measures its paper, forcing a layout, on every
 * render of its own.
 */
const DraggablePopover = meme(
  ({
    anchor,
    onClose,
    paperSx,
    modeless = false,
    anchorOrigin = ANCHOR_ORIGIN,
    transformOrigin,
    children
  }: DraggablePopoverProps) => {
    const [pinned, setPinned] = useState<{ top: number; left: number } | null>(null)
    const handleEntered = useCallback((node: HTMLElement) => {
      setPinned({ top: parseFloat(node.style.top), left: parseFloat(node.style.left) })
    }, [])
    const handleExited = useCallback(() => setPinned(null), [])

    const slotProps = useMemo(
      () => ({
        // Modeless, the root lets a click through, and the paper takes its own.
        root: { sx: modeless ? { p: 1, pointerEvents: 'none' } : { p: 1 } },
        // A dialog to the undo keys, which wait while one is open.
        paper: {
          sx: modeless ? [{ pointerEvents: 'auto' }, paperSx].flat() : paperSx,
          role: 'dialog'
        },
        transition: { onEntered: handleEntered, onExited: handleExited }
      }),
      [modeless, paperSx, handleEntered, handleExited]
    )

    return (
      <Popover
        open={anchor !== null}
        anchorEl={anchor}
        onClose={onClose}
        anchorOrigin={anchorOrigin}
        // Pinned to its paper's top left corner, so that corner goes on the point.
        transformOrigin={pinned ? PINNED_ORIGIN : transformOrigin}
        transitionDuration={0}
        anchorReference={pinned ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={pinned ?? undefined}
        // Pinned, the drag decides where it is and Popover holds no margin against it.
        marginThreshold={pinned ? -Infinity : 16}
        slotProps={slotProps}
        slots={{ paper: DraggablePaper }}
        hideBackdrop={modeless}
        disableEnforceFocus={modeless}
        disableAutoFocus={modeless}
        disableRestoreFocus={modeless}
        disableScrollLock={modeless}
      >
        {children}
      </Popover>
    )
  }
)

export default DraggablePopover
