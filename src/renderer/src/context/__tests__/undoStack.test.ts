// A run of writes to one field is one step, and anything else in between ends
// the run. An undo or a redo ends it too, so typing after an undo is a step of
// its own rather than a merge into the one just undone.
import { describe, expect, it } from 'vitest'
import { emptyStack, moveStep, pushStep, UNDO_LIMIT } from '../undo.zustand.helpers'

describe('pushing a step', () => {
  it('merges a write into the open run and keeps the value from before the run', () => {
    let stack = pushStep(emptyStack<string>(), 'before the run', 'field.host')
    stack = pushStep(stack, 'halfway', 'field.host')

    expect(stack.past).toEqual(['before the run'])
  })

  it('starts a new step once another key has come in between', () => {
    let stack = pushStep(emptyStack<string>(), 'host 1', 'field.host')
    stack = pushStep(stack, 'port', 'field.port')
    stack = pushStep(stack, 'host 2', 'field.host')

    expect(stack.past).toEqual(['host 1', 'port', 'host 2'])
  })

  it('never merges a step with no key', () => {
    let stack = pushStep(emptyStack<string>(), 'load 1', undefined)
    stack = pushStep(stack, 'load 2', undefined)

    expect(stack.past).toEqual(['load 1', 'load 2'])
  })

  it('leaves nothing to redo, merged or not', () => {
    let stack = pushStep(emptyStack<string>(), 'host', 'field.host')
    stack = moveStep(stack, 'undo', 'host', 'host after')
    expect(stack.future).toEqual(['host after'])

    expect(pushStep(stack, 'port', 'field.port').future).toEqual([])
  })

  it(`keeps the newest ${UNDO_LIMIT} and drops the oldest`, () => {
    let stack = emptyStack<number>()
    for (let step = 0; step <= UNDO_LIMIT; step++) stack = pushStep(stack, step, `field.${step}`)

    expect(stack.past).toHaveLength(UNDO_LIMIT)
    expect(stack.past[0]).toBe(1)
    expect(stack.past.at(-1)).toBe(UNDO_LIMIT)
  })
})

describe('moving a step', () => {
  it('takes the step that was replayed, not whatever landed on top meanwhile', () => {
    let stack = pushStep(emptyStack<string>(), 'replayed', 'field.host')
    stack = pushStep(stack, 'a load', undefined)

    stack = moveStep(stack, 'undo', 'replayed', 'host after')

    expect(stack.past).toEqual(['a load'])
    expect(stack.future).toEqual(['host after'])
  })

  it('carries the replaced value across, so the opposite move writes it back', () => {
    let stack = pushStep(emptyStack<string>(), 'old', 'field.host')
    stack = moveStep(stack, 'undo', 'old', 'new')
    expect(stack).toEqual({ past: [], future: ['new'], openKey: undefined })

    stack = moveStep(stack, 'redo', 'new', 'old')
    expect(stack).toEqual({ past: ['old'], future: [], openKey: undefined })
  })

  it('closes the run, so the next write to the same field is a step of its own', () => {
    let stack = pushStep(emptyStack<string>(), 'first run', 'field.host')
    stack = pushStep(stack, 'second run', 'field.port')
    stack = moveStep(stack, 'undo', 'second run', 'port after')
    stack = pushStep(stack, 'third run', 'field.port')

    expect(stack.past).toEqual(['first run', 'third run'])
  })
})
