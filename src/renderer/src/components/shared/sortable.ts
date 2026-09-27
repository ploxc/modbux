import {
  Modifier,
  PointerSensor,
  SensorDescriptor,
  SensorOptions,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'

/**
 * The pointer, after a few pixels of travel, so a click on what can be
 * dragged stays a click.
 */
export const useDragSensors = (): SensorDescriptor<SensorOptions>[] =>
  useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

/** Where a sortable item is drawn while a drag moves it or its neighbours. */
export const sortableStyle = ({
  transform,
  transition,
  isDragging
}: Pick<ReturnType<typeof useSortable>, 'transform' | 'transition' | 'isDragging'>): {
  transform: string | undefined
  transition: string | undefined
  position: 'relative'
  zIndex: number | undefined
} => ({
  transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  transition,
  position: 'relative',
  zIndex: isDragging ? 1 : undefined
})

/**
 * Keeps a dragged item on its list's axis and inside the list's parent, so
 * dragging past the edge does not grow the parent and give it a scrollbar.
 */
const restrictTo =
  (axis: 'vertical' | 'horizontal'): Modifier =>
  ({ transform, draggingNodeRect, containerNodeRect }) => {
    if (!draggingNodeRect || !containerNodeRect) return transform
    if (axis === 'vertical') {
      const least = containerNodeRect.top - draggingNodeRect.top
      const most = containerNodeRect.bottom - draggingNodeRect.bottom
      return { ...transform, x: 0, y: Math.min(Math.max(transform.y, least), most) }
    }
    const least = containerNodeRect.left - draggingNodeRect.left
    const most = containerNodeRect.right - draggingNodeRect.right
    return { ...transform, y: 0, x: Math.min(Math.max(transform.x, least), most) }
  }

export const VERTICAL_IN_PARENT = [restrictTo('vertical')]
export const HORIZONTAL_IN_PARENT = [restrictTo('horizontal')]
