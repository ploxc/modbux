import Box from '@mui/material/Box'
import { alpha } from '@mui/material/styles'
import ResizeHandle from '@renderer/components/shared/ResizeHandle'
import { meme } from '@renderer/components/shared/inputs/meme'
import { layoutOf, selectedUnit, useClientZustand } from '@renderer/context/client.zustand'
import {
  formatLayout,
  insertType,
  LayoutNode,
  LayoutSide,
  parseLayout,
  RegisterType,
  resizeSplit
} from '@shared'
import {
  createContext,
  DragEvent,
  Fragment,
  useCallback,
  useContext,
  useMemo,
  useState
} from 'react'
import { Group, Layout, LayoutChangedMeta, Panel } from 'react-resizable-panels'
import RegisterGrid from './RegisterGrid/RegisterGrid'

/** What a dragged section head carries, so a drop can tell it from anything else. */
export const SECTION_DRAG_TYPE = 'application/x-modbux-register-type'

interface SectionDrag {
  /** The register type whose head is being dragged, or none. */
  dragging: RegisterType | undefined
  setDragging: (type: RegisterType | undefined) => void
}

/** The drag under way, which a section head starts and every section's overlay reads. */
export const SectionDragContext = createContext<SectionDrag>({
  dragging: undefined,
  setDragging: () => undefined
})

/** The side of `rect` the point is nearest to, which is where a drop splits it. */
const nearestSide = (rect: DOMRect, x: number, y: number): LayoutSide => {
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
  const { dragging, setDragging } = useContext(SectionDragContext)
  const [side, setSide] = useState<LayoutSide | undefined>(undefined)
  const target = dragging !== undefined && dragging !== type

  const handleOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setSide(nearestSide(rect, event.clientX, event.clientY))
  }, [])
  const handleLeave = useCallback(() => setSide(undefined), [])

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      const dropSide = nearestSide(rect, event.clientX, event.clientY)
      setSide(undefined)
      setDragging(undefined)
      if (dragging === undefined) return
      const clientZustand = useClientZustand.getState()
      const layout = layoutOf(selectedUnit(clientZustand))
      clientZustand.setLayout(formatLayout(insertType(layout, type, dropSide, dragging)))
    },
    [dragging, setDragging, type]
  )

  return (
    <Box sx={{ position: 'relative', height: '100%' }}>
      <RegisterGrid type={type} />
      {target && (
        <Box
          data-testid={`section-drop-${type}`}
          onDragOver={handleOver}
          onDragLeave={handleLeave}
          onDrop={handleDrop}
          sx={{ position: 'absolute', inset: 0, zIndex: 10 }}
        >
          {side && (
            <Box
              sx={(theme) => ({
                position: 'absolute',
                ...HIGHLIGHT[side],
                pointerEvents: 'none',
                background: alpha(theme.palette.primary.main, 0.18),
                border: `2px dashed ${theme.palette.primary.main}`
              })}
            />
          )}
        </Box>
      )}
    </Box>
  )
})

interface LayoutBranchProps {
  node: LayoutNode
  /** The index of each part on the way down to this node, which names its panels. */
  path: number[]
}

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
              orientation={node.direction === 'r' ? 'vertical' : 'horizontal'}
              testId={`layout-handle-${path.join('-')}-${index}`}
            />
          )}
          <Panel id={panelId(path, index)} defaultSize={String(size)} minSize={120}>
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

/**
 * The unit on screen's register types, laid out as its layout says. A section
 * head dragged onto another section splits that one on the side it was dropped.
 */
const LayoutView = meme(() => {
  const layoutText = useClientZustand((z) => selectedUnit(z).layout)
  const node = useMemo(() => parseLayout(layoutText) ?? 'holding_registers', [layoutText])
  const [dragging, setDragging] = useState<RegisterType | undefined>(undefined)
  const drag = useMemo(() => ({ dragging, setDragging }), [dragging])

  return (
    <SectionDragContext.Provider value={drag}>
      <LayoutBranch key={structureOf(layoutText)} node={node} path={[]} />
    </SectionDragContext.Provider>
  )
})

export default LayoutView
