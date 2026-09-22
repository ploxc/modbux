// @vitest-environment happy-dom
//
// Cmd or Ctrl with Z undoes, with Shift+Z or Y redoes, on the stack of the view
// on screen. A focused text field keeps the key for its own history, and Home
// has no stack.
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from '../../context/__tests__/stubRenderer'

const replays = vi.hoisted(() => ({
  undoClient: vi.fn(async () => 'done'),
  redoClient: vi.fn(async () => 'done'),
  undoServer: vi.fn(async () => 'done'),
  redoServer: vi.fn(async () => 'done')
}))
vi.mock('@renderer/context/clientUndo', () => ({
  undoClient: replays.undoClient,
  redoClient: replays.redoClient
}))
vi.mock('@renderer/context/serverUndo', () => ({
  undoServer: replays.undoServer,
  redoServer: replays.redoServer
}))

beforeEach(() => {
  vi.resetModules()
  stubRenderer()
  for (const replay of Object.values(replays)) replay.mockClear()
})

const mount = async (appType: 'client' | 'server' | undefined): Promise<void> => {
  const { useLayoutZustand } = await import('@renderer/context/layout.zustand')
  useLayoutZustand.getState().setAppType(appType)
  const { default: UndoKeys } = await import('../UndoKeys')
  render(<UndoKeys />)
}

const press = (init: KeyboardEventInit, target: EventTarget = document.body): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

/** Which replays ran, by name. */
const ran = (): string[] =>
  Object.entries(replays)
    .filter(([, replay]) => replay.mock.calls.length > 0)
    .map(([name]) => name)

describe('on the client view', () => {
  it('undoes on Cmd+Z and on Ctrl+Z', async () => {
    await mount('client')

    press({ key: 'z', metaKey: true })
    expect(ran()).toEqual(['undoClient'])
    replays.undoClient.mockClear()

    press({ key: 'z', ctrlKey: true })
    expect(ran()).toEqual(['undoClient'])
  })

  it('redoes on Cmd+Shift+Z, Ctrl+Shift+Z and Ctrl+Y', async () => {
    await mount('client')

    press({ key: 'Z', metaKey: true, shiftKey: true })
    press({ key: 'Z', ctrlKey: true, shiftKey: true })
    press({ key: 'y', ctrlKey: true })

    expect(replays.redoClient).toHaveBeenCalledTimes(3)
    expect(ran()).toEqual(['redoClient'])
  })

  it('leaves the key to a focused text field', async () => {
    await mount('client')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()

    press({ key: 'z', metaKey: true }, input)

    expect(ran()).toEqual([])
    input.remove()
  })

  it('takes the key from a focused checkbox, which holds no text', async () => {
    await mount('client')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    document.body.append(checkbox)
    checkbox.focus()

    press({ key: 'z', metaKey: true }, checkbox)

    expect(ran()).toEqual(['undoClient'])
    checkbox.remove()
  })

  it('does nothing while a dialog is open', async () => {
    await mount('client')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.append(dialog)

    press({ key: 'z', metaKey: true })

    expect(ran()).toEqual([])
    dialog.remove()
  })

  it('does nothing for Z without a modifier', async () => {
    await mount('client')

    press({ key: 'z' })

    expect(ran()).toEqual([])
  })
})

describe('on the server view', () => {
  it('undoes and redoes the server stack, never the client one', async () => {
    await mount('server')

    press({ key: 'z', metaKey: true })
    press({ key: 'Z', metaKey: true, shiftKey: true })

    expect(ran()).toEqual(['undoServer', 'redoServer'])
  })
})

describe('on Home', () => {
  it('does nothing', async () => {
    await mount(undefined)

    press({ key: 'z', metaKey: true })

    expect(ran()).toEqual([])
  })
})
