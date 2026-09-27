import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { BREAKPOINTS, FOLDED_PANEL_HEIGHT } from './breakpoints'
import { meme } from '@renderer/components/shared/inputs/meme'
import { layoutOf, selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import { useLiveZustand } from '@renderer/context/live.zustand'
import {
  dockType,
  formatLayout,
  insertType,
  LayoutNode,
  LayoutSide,
  parseLayout,
  placeOf,
  RegisterType,
  RegisterTypeSchema,
  resizeSplit,
  typesIn
} from '@shared'
import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { edgeSideOf, LayoutRootContext } from './edgeDrop'
import {
  DndContext,
  DragEndEvent,
  DragMoveEvent,
  DragOverlay,
  useDndContext,
  useDndMonitor,
  useDroppable
} from '@dnd-kit/core'
import { Group, Layout, LayoutChangedMeta, Panel } from 'react-resizable-panels'
import RegisterGrid from './RegisterGrid/RegisterGrid'
import { useDragSensors } from '@renderer/components/shared/sortable'
import {
  REGISTER_TYPE_COLORS,
  REGISTER_TYPE_LABELS
} from '@renderer/components/client/RegisterConfig/RegisterConfig'

/** The register type whose section head is dragged, or none. */
const draggedType = (id: unknown): RegisterType | undefined => {
  const parsed = RegisterTypeSchema.safeParse(id)
  return parsed.success ? parsed.data : undefined
}

/**
 * Where the pointer is during a drag: where it went down, plus how far the
 * drag has moved. `PointerSensor` is the only sensor, so the event that
 * started the drag is a pointer event.
 */
const pointerOf = (event: DragMoveEvent | DragEndEvent): { x: number; y: number } => {
  const start = event.activatorEvent as PointerEvent
  return { x: start.clientX + event.delta.x, y: start.clientY + event.delta.y }
}

interface Edges {
  left: number
  right: number
  top: number
  bottom: number
}

/** The side of `rect` the point is nearest to, which is where a drop splits it. */
const nearestSide = (rect: Edges, x: number, y: number): LayoutSide => {
  const distances: [LayoutSide, number][] = [
    ['left', x - rect.left],
    ['right', rect.right - x],
    ['top', y - rect.top],
    ['bottom', rect.bottom - y]
  ]
  return distances.reduce((nearest, next) => (next[1] < nearest[1] ? next : nearest))[0]
}

const HIGHLIGHT: Record<LayoutSide, object> = {
  left: { left: 0, top: 0, bottom: 0, width: '50%' },
  right: { right: 0, top: 0, bottom: 0, width: '50%' },
  top: { left: 0, right: 0, top: 0, height: '50%' },
  bottom: { left: 0, right: 0, bottom: 0, height: '50%' }
}

/**
 * One register type's section, and while another section's head is dragged,
 * an overlay that shows the half the drop would give it.
 */
const LayoutLeaf = meme(({ type }: { type: RegisterType }) => {
  const { active } = useDndContext()
  const dragging = draggedType(active?.id)
  const [side, setSide] = useState<LayoutSide | undefined>(undefined)
  // Measured rather than asked of a container query: size containment on the
  // panel left rows blank at the top of the grid after its data was replaced.
  const [folded, setFolded] = useState(false)
  const leafRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const element = leafRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setFolded(entry.contentRect.height < BREAKPOINTS.gridHeight)
    })
    observer.observe(element)
    return (): void => observer.disconnect()
  }, [])
  const target = dragging !== undefined && dragging !== type

  // A section is on screen while it is mounted and not folded, and only then
  // does a poll read it.
  const uuid = useClientZustand((z) => z.selectedUuid)
  const unit = useClientZustand((z) => selectedUnit(z).uuid)
  useEffect(() => {
    if (folded) return
    const liveZustand = useLiveZustand.getState()
    liveZustand.showSection(uuid, unit, type)
    return (): void => liveZustand.hideSection(uuid, unit, type)
  }, [uuid, unit, type, folded])

  const { setNodeRef } = useDroppable({ id: type, disabled: !target })
  const setRefs = useCallback(
    (element: HTMLDivElement | null) => {
      leafRef.current = element
      setNodeRef(element)
    },
    [setNodeRef]
  )

  const root = useContext(LayoutRootContext)
  /** Whether the pointer is in an edge strip, where the drop is the layout's rather than this panel's. */
  const atEdge = (x: number, y: number): boolean => {
    const rect = root.current?.getBoundingClientRect()
    return rect !== undefined && edgeSideOf(rect, x, y) !== undefined
  }

  useDndMonitor({
    onDragMove: (event) => {
      const { x, y } = pointerOf(event)
      if (event.over?.id !== type || atEdge(x, y)) return setSide(undefined)
      setSide(nearestSide(event.over.rect, x, y))
    },
    onDragEnd: (event) => {
      setSide(undefined)
      const dragged = draggedType(event.active.id)
      if (event.over?.id !== type || dragged === undefined) return
      const { x, y } = pointerOf(event)
      if (atEdge(x, y)) return
      const clientZustand = useClientZustand.getState()
      const layout = layoutOf(selectedUnit(clientZustand))
      clientZustand.setLayout(
        formatLayout(insertType(layout, type, nearestSide(event.over.rect, x, y), dragged))
      )
    },
    onDragCancel: () => setSide(undefined)
  })

  return (
    <Box
      ref={setRefs}
      sx={{
        position: 'relative',
        height: '100%',
        // Folded, the grid's rows and column headers go and the head and footer stay.
        ...(folded && { '& .MuiDataGrid-main': { display: 'none' } })
      }}
    >
      <RegisterGrid type={type} />
      {target && side && (
        <Box
          data-testid={`section-drop-${type}`}
          sx={(theme) => ({
            position: 'absolute',
            zIndex: 10,
            ...HIGHLIGHT[side],
            pointerEvents: 'none',
            background: alpha(theme.palette.primary.main, 0.18),
            border: `1px dashed ${theme.palette.primary.main}`
          })}
        />
      )}
    </Box>
  )
})

interface LayoutBranchProps {
  node: LayoutNode
  /** The index of each part on the way down to this node, which names its panels. */
  path: number[]
}

/** How narrow a panel beside another may get, and how low one under another. */
const PANEL_MIN_WIDTH = 130

/** A split as a group of resizable panels, or a single section. */
const LayoutBranch = meme(({ node, path }: LayoutBranchProps): JSX.Element => {
  const handleChanged = useCallback(
    (layout: Layout, meta: LayoutChangedMeta) => {
      // Only a splitter the user moved: a mount reports sizes too.
      if (!meta.isUserInteraction) return
      if (typeof node === 'string') return
      const sizes = node.parts.map((_, index) => layout[panelId(path, index)])
      const clientZustand = useClientZustand.getState()
      const current = layoutOf(selectedUnit(clientZustand))
      clientZustand.setLayout(formatLayout(resizeSplit(current, path, sizes)))
    },
    [node, path]
  )

  if (typeof node === 'string') return <LayoutLeaf type={node} />

  return (
    <Group
      orientation={node.direction === 'r' ? 'horizontal' : 'vertical'}
      onLayoutChanged={handleChanged}
      style={{ height: '100%' }}
    >
      {node.parts.map(({ node: part, size }, index) => (
        <Fragment key={structureOf(formatLayout(part))}>
          {index > 0 && (
            <ResizeHandle
              gutter={0.5}
              orientation={node.direction === 'r' ? 'vertical' : 'horizontal'}
              testId={`layout-handle-${path.join('-')}-${index}`}
            />
          )}
          <Panel
            id={panelId(path, index)}
            defaultSize={String(size)}
            // Under another, a panel lower than a grid is worth folds to its
            // head and footer: the controls and the round trip stay.
            {...(node.direction === 'r'
              ? { minSize: PANEL_MIN_WIDTH }
              : {
                  minSize: BREAKPOINTS.gridHeight,
                  collapsible: true,
                  collapsedSize: FOLDED_PANEL_HEIGHT
                })}
          >
            <LayoutBranch node={part} path={[...path, index]} />
          </Panel>
        </Fragment>
      ))}
    </Group>
  )
})

/**
 * A layout string without its sizes: the key a branch is drawn under, so a
 * drop or a stack draws the panels afresh and a resize, which the panels
 * already show, does not.
 */
const structureOf = (layout: string): string => layout.replace(/:\d+(\.\d+)?/g, '')

/** The id of the panel at `index` of the split at `path`. */
const panelId = (path: number[], index: number): string => ['layout', ...path, index].join('-')

/** The dragged section's name under the pointer. */
const SectionDragPreview = meme(() => {
  const { active } = useDndContext()
  const dragging = draggedType(active?.id)
  if (dragging === undefined) return null
  return (
    <Box
      sx={(theme) => ({
        display: 'inline-flex',
        px: 1,
        py: 0.5,
        borderRadius: 1,
        fontSize: 13,
        background: theme.palette.background.paper,
        boxShadow: theme.shadows[4],
        borderLeft: `3px solid ${REGISTER_TYPE_COLORS[dragging]}`
      })}
    >
      {REGISTER_TYPE_LABELS[dragging]}
    </Box>
  )
})

/** Where along an edge the docked panel would go: the share the dock gives it. */
const edgeHighlight = (side: LayoutSide, share: number): object => {
  const size = `${share}%`
  if (side === 'left') return { left: 0, top: 0, bottom: 0, width: size }
  if (side === 'right') return { right: 0, top: 0, bottom: 0, width: size }
  if (side === 'top') return { left: 0, right: 0, top: 0, height: size }
  return { left: 0, right: 0, bottom: 0, height: size }
}

/**
 * While a section head is dragged into a strip along the layout's edge, the
 * room it would take along that whole edge; dropped there, it takes it.
 */
const EdgeDrop = meme(() => {
  const root = useContext(LayoutRootContext)
  const [edge, setEdge] = useState<{ side: LayoutSide; share: number } | undefined>(undefined)

  /** The edge the pointer docks along and the layout the drop would give, or none. */
  const dockOf = (
    event: DragMoveEvent | DragEndEvent
  ): { side: LayoutSide; share: number; docked: LayoutNode } | undefined => {
    const dragged = draggedType(event.active.id)
    const rect = root.current?.getBoundingClientRect()
    if (dragged === undefined || rect === undefined) return undefined
    const { x, y } = pointerOf(event)
    const side = edgeSideOf(rect, x, y)
    const layout = layoutOf(selectedUnit(useClientZustand.getState()))
    if (side === undefined || typesIn(layout).length < 2) return undefined
    const docked = dockType(layout, dragged, side)
    const place = placeOf(docked, dragged)
    return place && { side, share: place.share, docked }
  }

  useDndMonitor({
    onDragMove: (event) => setEdge(dockOf(event)),
    onDragEnd: (event) => {
      setEdge(undefined)
      const dock = dockOf(event)
      if (dock) useClientZustand.getState().setLayout(formatLayout(dock.docked))
    },
    onDragCancel: () => setEdge(undefined)
  })

  if (edge === undefined) return null
  return (
    <Box
      data-testid={`layout-edge-drop-${edge.side}`}
      sx={(theme) => ({
        position: 'absolute',
        zIndex: 11,
        ...edgeHighlight(edge.side, edge.share),
        pointerEvents: 'none',
        background: alpha(theme.palette.primary.main, 0.18),
        border: `1px dashed ${theme.palette.primary.main}`
      })}
    />
  )
})

/**
 * The unit on screen's register types, laid out as its layout says. A section
 * head dragged onto another section splits that one on the side it was dropped.
 */
const LayoutView = meme(() => {
  const layoutText = useClientZustand((z) => selectedUnit(z).layout)
  const node = useMemo(() => parseLayout(layoutText) ?? 'holding_registers', [layoutText])
  const sensors = useDragSensors()
  const rootRef = useRef<HTMLDivElement | null>(null)

  return (
    <DndContext sensors={sensors}>
      <LayoutRootContext.Provider value={rootRef}>
        {/* The ground between the panels is the card the panels sit on. */}
        <Box
          ref={rootRef}
          sx={(theme) => ({
            position: 'relative',
            height: '100%',
            boxSizing: 'border-box',
            p: 0.5,
            background: theme.palette.background.paper
          })}
        >
          <LayoutBranch key={structureOf(layoutText)} node={node} path={[]} />
          <EdgeDrop />
        </Box>
      </LayoutRootContext.Provider>
      <DragOverlay>
        <SectionDragPreview />
      </DragOverlay>
    </DndContext>
  )
})

export default LayoutView
