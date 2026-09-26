import { describe, expect, it } from 'vitest'
import {
  addType,
  formatLayout,
  insertType,
  parseLayout,
  removeType,
  resizeSplit,
  stackLayout,
  typesIn
} from '../layout'

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
