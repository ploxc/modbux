import { describe, expect, it } from 'vitest'
import {
  addType,
  dockType,
  formatLayout,
  insertType,
  LayoutNode,
  parseLayout,
  placeOf,
  removeType,
  resizeSplit,
  restoreType,
  stackLayout,
  typesIn
} from '../layout'
import { RegisterType } from '../types/register'

// A unit's layout is a tree of rows and columns written as one string, so a
// config file carries it and a hand-edited one is read back or refused.

describe('the layout string', () => {
  it.each(['hr', 'r(hr:60,c(ir:50,co:50):40)', 'c(hr:50,r(ir:30,co:30,di:40):50)'])(
    'reads %s and writes it back the same',
    (text) => {
      const node = parseLayout(text)
      expect(node).toBeDefined()
      expect(node && formatLayout(node)).toBe(text)
    }
  )

  it.each([
    '',
    'xx',
    'hrr',
    'r(hr:50)',
    'r(hr:50,hr:50)',
    'r(hr:0,ir:100)',
    'r(hr:50,ir)',
    'r(hr:50,ir:50'
  ])('refuses %j', (text) => {
    expect(parseLayout(text)).toBeUndefined()
  })
})

describe('turning a type on and off', () => {
  it('puts a second type below the first, half each', () => {
    expect(formatLayout(addType('holding_registers', 'coils'))).toBe('c(hr:50,co:50)')
  })

  it('gives a third type an equal share of the outermost split', () => {
    const two = parseLayout('r(hr:50,ir:50)')
    expect(two && formatLayout(addType(two, 'coils'))).toBe('r(hr:33.3,ir:33.3,co:33.3)')
  })

  it('takes a type out, and a split left with one part becomes that part', () => {
    const node = parseLayout('r(hr:60,c(ir:50,co:50):40)')
    expect(node && formatLayout(removeType(node, 'coils') ?? 'coils')).toBe('r(hr:60,ir:40)')
  })

  it('answers nothing for the last type', () => {
    expect(removeType('holding_registers', 'holding_registers')).toBeUndefined()
  })
})

describe('dropping a panel on another', () => {
  it('splits the target on the side it was dropped, and moves the type from where it was', () => {
    const node = parseLayout('r(hr:50,ir:50)')
    const moved = node && insertType(node, 'holding_registers', 'bottom', 'input_registers')
    expect(moved && formatLayout(moved)).toBe('c(hr:50,ir:50)')
  })

  it('puts a dropped type first on the left and on top', () => {
    const node = parseLayout('r(hr:60,co:40)')
    const moved = node && insertType(node, 'coils', 'top', 'input_registers')
    expect(moved && formatLayout(moved)).toBe('r(hr:60,c(ir:50,co:50):40)')
  })

  it('leaves the layout alone when a panel is dropped on itself', () => {
    const node = parseLayout('r(hr:50,ir:50)')
    expect(node && insertType(node, 'coils', 'left', 'coils')).toEqual(node)
  })
})

describe('stacking', () => {
  it('puts every type in one column, sharing the room equally', () => {
    const node = parseLayout('r(hr:60,c(ir:50,co:50):40)')
    expect(node && formatLayout(stackLayout(node, 'c'))).toBe('c(hr:33.3,ir:33.3,co:33.3)')
  })

  it('leaves a single type as it is', () => {
    expect(stackLayout('coils', 'r')).toBe('coils')
  })
})

describe('resizing', () => {
  it('writes the sizes a dragged splitter reports into the split at its path', () => {
    const node = parseLayout('r(hr:60,c(ir:50,co:50):40)')
    const resized = node && resizeSplit(node, [1], [30, 70])
    expect(resized && formatLayout(resized)).toBe('r(hr:60,c(ir:30,co:70):40)')
  })

  it('keeps the size of a part the report names none for', () => {
    const node = parseLayout('r(hr:50,ir:25,co:25)')
    const resized = node && resizeSplit(node, [], [40])
    expect(resized && formatLayout(resized)).toBe('r(hr:40,ir:25,co:25)')
  })
})

describe('the types a layout shows', () => {
  it('are listed in the order it draws them', () => {
    const node = parseLayout('r(co:60,c(hr:50,di:50):40)')
    expect(node && typesIn(node)).toEqual(['coils', 'holding_registers', 'discrete_inputs'])
  })
})

/** The layout a string names, failing the test for one that names none. */
const layout = (text: string): LayoutNode => {
  const node = parseLayout(text)
  if (node === undefined) throw new Error(`no layout: ${text}`)
  return node
}

/** Remove `type` and put it back where it was, as a string. */
const removeAndRestore = (
  text: string,
  type: RegisterType,
  between = (node: LayoutNode): LayoutNode => node
): string | undefined => {
  const node = layout(text)
  const place = placeOf(node, type)
  const without = removeType(node, type)
  if (place === undefined || without === undefined)
    throw new Error(`${type} has no place in ${text}`)
  const restored = restoreType(between(without), type, place)
  return restored && formatLayout(restored)
}

describe('restoreType', () => {
  it.each([
    ['below its neighbour, in a split of its own', 'r(hr:60,c(ir:50,co:50):40)', 'coils'],
    ['above its neighbour when it came first', 'r(hr:60,c(ir:30,co:70):40)', 'input_registers'],
    ['back into a split running its way, at its share', 'c(hr:20,ir:30,co:50)', 'input_registers'],
    ['first in a split running its way', 'c(hr:20,ir:30,co:50)', 'holding_registers'],
    ['beside a part of two types', 'r(c(hr:50,ir:50):70,co:30)', 'coils'],
    ['in a row', 'r(hr:25,ir:75)', 'input_registers']
  ] as const)('puts a type back %s', (_, text, type) => {
    expect(removeAndRestore(text, type)).toBe(text)
  })

  it('puts it beside its neighbour after the neighbour moved', () => {
    // Coils sat below input registers; input registers then moved left of holding.
    const moved = (node: LayoutNode): LayoutNode =>
      insertType(node, 'holding_registers', 'left', 'input_registers')
    expect(removeAndRestore('r(hr:60,c(ir:50,co:50):40)', 'coils', moved)).toBe(
      'r(c(ir:50,co:50):50,hr:50)'
    )
  })

  it('answers nothing when no part holds exactly its neighbours', () => {
    const place = placeOf(layout('r(c(hr:50,ir:50):70,co:30)'), 'coils')
    if (place === undefined) throw new Error('coils has no place')
    expect(restoreType(layout('r(hr:50,di:50)'), 'coils', place)).toBeUndefined()
  })

  it('has no place for a type alone', () => {
    expect(placeOf(layout('hr'), 'holding_registers')).toBeUndefined()
  })
})

describe('dockType', () => {
  it.each([
    [
      'along the right of a column, full height',
      'c(hr:33.3,ir:33.3,co:33.4)',
      'coils',
      'right',
      'r(c(hr:50,ir:50):50,co:50)'
    ],
    ['along the left of a column', 'c(hr:50,ir:50)', 'input_registers', 'left', 'r(ir:50,hr:50)'],
    [
      'as the last part of a row, an equal share',
      'r(hr:50,ir:50)',
      'coils',
      'right',
      'r(hr:33.3,ir:33.3,co:33.3)'
    ],
    ['as the first part of a row', 'r(hr:50,ir:50)', 'coils', 'left', 'r(co:33.3,hr:33.3,ir:33.3)'],
    [
      'along the top of a row, full width',
      'r(hr:50,c(ir:50,co:50):50)',
      'coils',
      'top',
      'c(co:50,r(hr:50,ir:50):50)'
    ]
  ] as const)('puts a type %s', (_, text, type, side, docked) => {
    const node = layout(text)
    const withType = typesIn(node).includes(type) ? node : addType(node, type)
    expect(formatLayout(dockType(withType, type, side))).toBe(docked)
  })

  it('leaves a layout of one type as it is', () => {
    expect(formatLayout(dockType(layout('hr'), 'holding_registers', 'right'))).toBe('hr')
  })
})
