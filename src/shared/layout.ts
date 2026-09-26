import { RegisterType } from './types/register'

/**
 * How a unit's register types are laid out: one type, or a split of two or
 * more parts side by side (`r`, a row) or one above the other (`c`, a column),
 * each part taking a share of the split in percent.
 *
 * As a string, a type is its short name and a split is its direction with its
 * parts in brackets: `r(hr:60,c(ir:50,co:50):40)` is holding registers on the
 * left and, on the right, input registers above coils.
 */
export type LayoutNode = RegisterType | LayoutSplit

interface LayoutSplit {
  direction: 'r' | 'c'
  parts: LayoutPart[]
}

interface LayoutPart {
  node: LayoutNode
  size: number
}

/** The side of a panel another one is dropped on. */
export type LayoutSide = 'left' | 'right' | 'top' | 'bottom'

const SHORT_NAMES: Record<RegisterType, string> = {
  holding_registers: 'hr',
  input_registers: 'ir',
  coils: 'co',
  discrete_inputs: 'di'
}

const TYPES_BY_SHORT_NAME = new Map(
  Object.entries(SHORT_NAMES).map(([type, short]) => [short, type as RegisterType])
)

/** The layout a unit starts with: its holding registers alone. */
export const DEFAULT_LAYOUT = 'hr'

/** The layout as a string, sizes rounded to a tenth of a percent. */
export const formatLayout = (node: LayoutNode): string => {
  if (typeof node === 'string') return SHORT_NAMES[node]
  const parts = node.parts.map(({ node, size }) => `${formatLayout(node)}:${round(size)}`)
  return `${node.direction}(${parts.join(',')})`
}

const round = (size: number): number => Math.round(size * 10) / 10

/**
 * The layout a string names, or undefined for one that names none: an unknown
 * type, a type twice, a split of fewer than two parts, a size that is no
 * positive number, or anything left over.
 */
export const parseLayout = (text: string): LayoutNode | undefined => {
  let position = 0
  const seen = new Set<RegisterType>()

  const readNode = (): LayoutNode | undefined => {
    const direction = text[position]
    if ((direction === 'r' || direction === 'c') && text[position + 1] === '(') {
      position += 2
      const parts: LayoutPart[] = []
      for (;;) {
        const node = readNode()
        if (node === undefined || text[position] !== ':') return undefined
        position++
        const match = /^\d+(\.\d+)?/.exec(text.slice(position))
        if (!match) return undefined
        const size = Number(match[0])
        if (size <= 0) return undefined
        position += match[0].length
        parts.push({ node, size })
        if (text[position] === ',') {
          position++
          continue
        }
        if (text[position] !== ')') return undefined
        position++
        break
      }
      return parts.length < 2 ? undefined : { direction, parts }
    }
    const type = TYPES_BY_SHORT_NAME.get(text.slice(position, position + 2))
    if (type === undefined || seen.has(type)) return undefined
    seen.add(type)
    position += 2
    return type
  }

  const node = readNode()
  return node !== undefined && position === text.length ? node : undefined
}

/** The register types a layout shows, in the order it draws them. */
export const typesIn = (node: LayoutNode): RegisterType[] =>
  typeof node === 'string' ? [node] : node.parts.flatMap(({ node }) => typesIn(node))

/**
 * The layout without `type`, or undefined when it was the only one. A split
 * left with one part becomes that part, and the parts left share the room of
 * the one that went.
 */
export const removeType = (node: LayoutNode, type: RegisterType): LayoutNode | undefined => {
  if (typeof node === 'string') return node === type ? undefined : node
  const parts = node.parts.flatMap(({ node: part, size }) => {
    const left = removeType(part, type)
    return left === undefined ? [] : [{ node: left, size }]
  })
  const [only] = parts
  if (only === undefined) return undefined
  if (parts.length === 1) return only.node
  return { direction: node.direction, parts: normalised(parts) }
}

/** The parts with their sizes scaled to add up to 100. */
const normalised = (parts: LayoutPart[]): LayoutPart[] => {
  const total = parts.reduce((sum, { size }) => sum + size, 0)
  return parts.map((part) => ({ ...part, size: (part.size / total) * 100 }))
}

/**
 * The layout with `type` added beside `target`, on `side` of it, halving the
 * room `target` had. A type already in the layout moves there.
 */
export const insertType = (
  node: LayoutNode,
  target: RegisterType,
  side: LayoutSide,
  type: RegisterType
): LayoutNode => {
  if (type === target) return node
  const without = removeType(node, type) ?? target
  return insertBeside(without, target, side, type)
}

const insertBeside = (
  node: LayoutNode,
  target: RegisterType,
  side: LayoutSide,
  type: RegisterType
): LayoutNode => {
  if (typeof node === 'string') {
    if (node !== target) return node
    const direction = side === 'left' || side === 'right' ? 'r' : 'c'
    const first = side === 'left' || side === 'top'
    return {
      direction,
      parts: first
        ? [
            { node: type, size: 50 },
            { node: target, size: 50 }
          ]
        : [
            { node: target, size: 50 },
            { node: type, size: 50 }
          ]
    }
  }
  return {
    direction: node.direction,
    parts: node.parts.map(({ node: part, size }) => ({
      node: insertBeside(part, target, side, type),
      size
    }))
  }
}

/**
 * The layout with `type` added: at the end of the outermost split, taking an
 * equal share, or below a single type, in a column.
 */
export const addType = (node: LayoutNode, type: RegisterType): LayoutNode => {
  if (typesIn(node).includes(type)) return node
  if (typeof node === 'string') return insertBeside(node, node, 'bottom', type)
  const share = 100 / (node.parts.length + 1)
  const scale = (100 - share) / 100
  return {
    direction: node.direction,
    parts: [
      ...node.parts.map((part) => ({ ...part, size: part.size * scale })),
      { node: type, size: share }
    ]
  }
}

/** Every type of the layout in one row or one column, sharing the room equally. */
export const stackLayout = (node: LayoutNode, direction: 'r' | 'c'): LayoutNode => {
  const types = typesIn(node)
  const [only] = types
  if (types.length === 1 && only !== undefined) return only
  return { direction, parts: types.map((type) => ({ node: type, size: 100 / types.length })) }
}

/**
 * The layout with the sizes of the split at `path` replaced, which is what a
 * dragged splitter reports. The path is the index of each part on the way
 * down from the outermost split.
 */
export const resizeSplit = (
  node: LayoutNode,
  path: number[],
  sizes: (number | undefined)[]
): LayoutNode => {
  if (typeof node === 'string') return node
  const [index, ...rest] = path
  if (index === undefined) {
    // A part the report names no size for keeps its own.
    return {
      direction: node.direction,
      parts: node.parts.map((part, i) => ({ ...part, size: sizes[i] ?? part.size }))
    }
  }
  return {
    direction: node.direction,
    parts: node.parts.map((part, i) =>
      i === index ? { ...part, node: resizeSplit(part.node, rest, sizes) } : part
    )
  }
}
