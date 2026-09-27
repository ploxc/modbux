import {
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
