import Popover from '@mui/material/Popover'
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
  children: ReactNode
}

const ANCHOR_ORIGIN = { vertical: 'bottom', horizontal: 'left' } as const

/**
 * A popover that opens below its anchor and then stays where it was dragged.
 *
 * Once it has opened it is pinned to the position Popover gave it, because
 * Popover places itself again from its anchor on a window resize, which would
 * throw away a drag. The children render inside it, so state they keep
 * renders them alone: Popover measures its paper, forcing a layout, on every
 * render of its own.
 */
const DraggablePopover = meme(({ anchor, onClose, paperSx, children }: DraggablePopoverProps) => {
  const [pinned, setPinned] = useState<{ top: number; left: number } | null>(null)
  const handleEntered = useCallback((node: HTMLElement) => {
    setPinned({ top: parseFloat(node.style.top), left: parseFloat(node.style.left) })
  }, [])
  const handleExited = useCallback(() => setPinned(null), [])

  const slotProps = useMemo(
    () => ({
      root: { sx: { p: 1 } },
      paper: { sx: paperSx },
      transition: { onEntered: handleEntered, onExited: handleExited }
    }),
    [paperSx, handleEntered, handleExited]
  )

  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={ANCHOR_ORIGIN}
      transitionDuration={0}
      anchorReference={pinned ? 'anchorPosition' : 'anchorEl'}
      anchorPosition={pinned ?? undefined}
      // Pinned, the drag decides where it is and Popover holds no margin against it.
      marginThreshold={pinned ? -Infinity : 16}
      slotProps={slotProps}
      slots={{ paper: DraggablePaper }}
    >
      {children}
    </Popover>
  )
})

export default DraggablePopover
