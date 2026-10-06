import { PopoverPaper } from '@mui/material/Popover'
import { PaperProps } from '@mui/material/Paper'
import { useTheme } from '@mui/material/styles'
import { meme } from '@renderer/components/shared/inputs/meme'
import { forwardRef, PointerEvent, Ref, useCallback, useEffect, useRef, useState } from 'react'
import Draggable, { DraggableData, DraggableEvent } from 'react-draggable'

/** The class of the element a DraggablePaper is dragged by, its title bar. */
export const DRAG_HANDLE_CLASS = 'draggable-paper-handle'

/** Hands `node` to a ref the parent passed, whichever kind it is. */
const assignRef = <T,>(ref: Ref<T> | undefined, node: T | null): void => {
  if (typeof ref === 'function') ref(node)
  else if (ref) (ref as { current: T | null }).current = node
}

/**
 * A popover's paper that drags by its `DRAG_HANDLE_CLASS` element and keeps
 * a theme spacing unit inside the window: a resize from its corner stops at
 * the window's edge, and a window that shrinks moves it back inside before it
 * shrinks it. Handed to a Popover as its paper slot.
 */
const DraggablePaper = meme(
  forwardRef<HTMLDivElement, PaperProps>(function DraggablePaper(
    { onPointerDown, ...props },
    forwardedRef
  ) {
    const theme = useTheme()
    const margin = parseFloat(theme.spacing(1))
    const nodeRef = useRef<HTMLDivElement | null>(null)
    const [position, setPosition] = useState({ x: 0, y: 0 })

    const setRefs = useCallback(
      (node: HTMLDivElement | null) => {
        nodeRef.current = node
        assignRef(forwardedRef, node)
      },
      [forwardedRef]
    )

    /**
     * Caps the size at the window's edge, measured from the given top left
     * corner. A paper with no resize corner keeps the size its content gives it.
     */
    const clampSize = useCallback(
      (node: HTMLDivElement, left: number, top: number, width: number, height: number) => {
        const maxWidth = window.innerWidth - left - margin
        const maxHeight = window.innerHeight - top - margin
        node.style.maxWidth = `${maxWidth}px`
        node.style.maxHeight = `${maxHeight}px`
        if (getComputedStyle(node).resize === 'none') return
        // A resize dragged past the edge leaves a size the window cannot show.
        node.style.width = `${Math.min(width, maxWidth)}px`
        node.style.height = `${Math.min(height, maxHeight)}px`
      },
      [margin]
    )

    const updateMax = useCallback(() => {
      const node = nodeRef.current
      if (!node) return
      const { left, top, width, height } = node.getBoundingClientRect()
      clampSize(node, left, top, width, height)
    }, [clampSize])

    /** After a window resize: back inside first, smaller only where it no longer fits. */
    const snapInside = useCallback(() => {
      const node = nodeRef.current
      if (!node) return
      const { left, top, right, bottom, width, height } = node.getBoundingClientRect()
      // Left or up as far as needed, never past the left or top margin.
      let dx = Math.min(0, Math.max(window.innerWidth - margin - right, margin - left))
      let dy = Math.min(0, Math.max(window.innerHeight - margin - bottom, margin - top))
      // Right or down where it sticks out on the left or top.
      if (left + dx < margin) dx = margin - left
      if (top + dy < margin) dy = margin - top
      if (dx !== 0 || dy !== 0) setPosition((p) => ({ x: p.x + dx, y: p.y + dy }))
      // The rect still holds the old position here, so the new one is passed.
      clampSize(node, left + dx, top + dy, width, height)
    }, [clampSize, margin])

    // One frame after opening, once Popover has placed it.
    useEffect(() => {
      const frame = requestAnimationFrame(updateMax)
      window.addEventListener('resize', snapInside)
      return (): void => {
        cancelAnimationFrame(frame)
        window.removeEventListener('resize', snapInside)
      }
    }, [updateMax, snapInside])

    const handleDrag = useCallback((_: DraggableEvent, data: DraggableData) => {
      setPosition({ x: data.x, y: data.y })
    }, [])

    const handlePointerDown = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        updateMax()
        onPointerDown?.(event)
      },
      [updateMax, onPointerDown]
    )

    return (
      <Draggable
        nodeRef={nodeRef}
        handle={`.${DRAG_HANDLE_CLASS}`}
        bounds="parent"
        position={position}
        onDrag={handleDrag}
        onStop={updateMax}
      >
        <PopoverPaper ref={setRefs} {...props} onPointerDown={handlePointerDown} />
      </Draggable>
    )
  })
)

DraggablePaper.displayName = 'DraggablePaper'

export default DraggablePaper
