// @vitest-environment happy-dom
/* eslint-disable @typescript-eslint/explicit-function-return-type */
//
// What `updateBitMap` deletes is what a saved config file holds: an empty
// comment, the default colour and a false invert are all absences rather than
// values, and an entry that has lost all three is not an entry.
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Both root stores register IPC listeners and run init() at import time.
vi.hoisted(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
  const w = window as unknown as { electron: unknown; api: unknown }
  w.electron = {
    ipcRenderer: { on: () => () => {}, send: () => {}, invoke: async () => undefined }
  }
  w.api = new Proxy({}, { get: () => () => Promise.resolve(undefined) })
})

// The panel hands each indicator the three handlers this file drives. The real
// one draws a Paper, a TextField and a Popover, and answers none of them
// without a click path through all three.
const { props } = vi.hoisted(() => ({
  props: new Map<number, Record<string, (...args: never[]) => void>>()
}))
vi.mock('../BitIndicator', async () => {
  const { meme } = await import('@renderer/components/shared/inputs/meme')
  return {
    default: meme((given: { bitIndex: number }) => {
      props.set(given.bitIndex, given as unknown as Record<string, (...args: never[]) => void>)
      return null
    })
  }
})

import { act, render } from '@testing-library/react'
import { useClientZustand } from '@renderer/context/client.zustand'
import { useDataZustand } from '@renderer/context/data.zustand'
import { BitMapConfig, defaultClientState, emptyRegisterMapping, RegisterData } from '@shared'
import BitMapDetailPanel from '../BitMapDetailPanel'

const row = (uint16: number): RegisterData =>
  ({
    id: 0,
    buffer: new Uint8Array(2),
    hex: uint16.toString(16).padStart(4, '0'),
    words: { uint16 },
    bit: false,
    isScanned: false
  }) as unknown as RegisterData

/** The panel, drawn over a mapping that holds this bitmap at address 0. */
const panelOver = (bitMap: BitMapConfig): void => {
  const mapping = emptyRegisterMapping()
  mapping.holding_registers[0] = { bitMap }
  useClientZustand.setState({ registerMapping: mapping } as never)
  render(<BitMapDetailPanel address={0} />)
}

const bitMapNow = (): BitMapConfig | undefined =>
  useClientZustand.getState().registerMapping.holding_registers[0]?.bitMap

/** The whole mapping entry, which is what `SaveButton` writes to the file. */
const mappingNow = (): unknown => useClientZustand.getState().registerMapping.holding_registers

const call = (bitIndex: number, handler: string, ...args: unknown[]): void => {
  const handlers = props.get(bitIndex)
  if (!handlers) throw new Error(`bit ${bitIndex} was not drawn`)
  const fn = handlers[handler]
  if (!fn) throw new Error(`bit ${bitIndex} has no ${handler}`)
  act(() => fn(...(args as never[])))
}

beforeEach(() => {
  props.clear()
  useDataZustand.setState({ clientState: { ...defaultClientState, connectState: 'connected' } })
  useClientZustand.setState({
    ready: true,
    registerConfig: { ...useClientZustand.getState().registerConfig, type: 'holding_registers' }
  } as never)
  useDataZustand.setState({ registerData: [row(0)] })
})

describe('what a bit keeps in the mapping', () => {
  it('keeps a comment that was typed', () => {
    panelOver({})

    call(3, 'onCommentChange', 3, 'the run signal')

    expect(bitMapNow()).toEqual({ '3': { comment: 'the run signal' } })
  })

  // The register keeps an entry holding nothing: `setRegisterMapping` writes
  // `bitMap: undefined` rather than deleting the register, and `SaveButton`
  // deletes only an entry whose `dataType` is `none`, so the file carries
  // `"0": {}`. Every field of `RegisterMapValueSchema` is optional, so it loads
  // again, and `showMapping` skips an entry with no data type.
  it('drops a comment that was emptied, and the bit with it', () => {
    panelOver({ '3': { comment: 'the run signal' } })

    call(3, 'onCommentChange', 3, '')

    expect(bitMapNow()).toBe(undefined)
    expect(mappingNow()).toEqual({ 0: { bitMap: undefined } })
  })

  it('drops the default colour and keeps the bit', () => {
    panelOver({ '3': { comment: 'the run signal' } })

    call(3, 'onColorChange', 3, 'default')

    expect(bitMapNow()).toEqual({ '3': { comment: 'the run signal' } })
  })

  it('keeps a colour that is not the default', () => {
    panelOver({ '3': { comment: 'the run signal' } })

    call(3, 'onColorChange', 3, 'red')

    expect(bitMapNow()).toEqual({ '3': { comment: 'the run signal', color: 'red' } })
  })

  it('keeps an invert that was switched on', () => {
    panelOver({ '3': { comment: 'the run signal' } })

    call(3, 'onInvertChange', 3, true)

    expect(bitMapNow()).toEqual({ '3': { comment: 'the run signal', invert: true } })
  })

  // The handler sends `undefined` rather than `false`, so the key is there and
  // holds nothing. An entry counting that key is one the empty check keeps, and
  // `SaveButton` would write a bit holding `{}` into the file.
  it('drops an invert that was switched off, and the bit it was the whole of', () => {
    panelOver({ '3': { invert: true } })

    call(3, 'onInvertChange', 3, false)

    expect(bitMapNow()).toBe(undefined)
  })

  it('keeps the other bits when one empties', () => {
    panelOver({ '3': { comment: 'the run signal' }, '9': { comment: 'the fault' } })

    call(3, 'onCommentChange', 3, '')

    expect(bitMapNow()).toEqual({ '9': { comment: 'the fault' } })
  })
})
