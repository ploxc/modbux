// @vitest-environment happy-dom
//
// Cmd or Ctrl with Z undoes, with Shift+Z or Y redoes, on the stack of the view
// on screen. A focused text field keeps the key for its own history, and Home
// has no stack.
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubRenderer } from '../../context/__tests__/stubRenderer'

const replays = vi.hoisted(() => ({
  undoClient: vi.fn(async (): Promise<string> => 'done'),
  redoClient: vi.fn(async (): Promise<string> => 'done'),
  undoServer: vi.fn(async (): Promise<string> => 'done'),
  redoServer: vi.fn(async (): Promise<string> => 'done')
}))
const { enqueueSnackbar } = vi.hoisted(() => ({ enqueueSnackbar: vi.fn() }))
vi.mock('notistack', () => ({
  useSnackbar: (): { enqueueSnackbar: typeof enqueueSnackbar } => ({ enqueueSnackbar })
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
  for (const replay of Object.values(replays)) replay.mockReset().mockResolvedValue('done')
  enqueueSnackbar.mockClear()
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

describe('what the user is told', () => {
  it('says there is nothing to undo, or to redo, on an empty stack', async () => {
    await mount('client')
    replays.undoClient.mockResolvedValue('empty')
    replays.redoClient.mockResolvedValue('empty')

    press({ key: 'z', metaKey: true })
    press({ key: 'Z', metaKey: true, shiftKey: true })

    await vi.waitFor(() =>
      expect(enqueueSnackbar.mock.calls.map(([said]) => said)).toEqual([
        { message: 'Nothing to undo', variant: 'info' },
        { message: 'Nothing to redo', variant: 'info' }
      ])
    )
  })

  it('says to disconnect for a connection setting', async () => {
    await mount('client')
    replays.undoClient.mockResolvedValue('refused-connected')

    press({ key: 'z', metaKey: true })

    await vi.waitFor(() =>
      expect(enqueueSnackbar).toHaveBeenCalledWith({
        message: 'Disconnect to undo a connection setting',
        variant: 'warning'
      })
    )
  })

  it('adds nothing to a refusal that was reported where it happened', async () => {
    await mount('client')
    replays.undoClient.mockResolvedValue('refused')

    press({ key: 'z', metaKey: true })
    await vi.waitFor(() => expect(replays.undoClient).toHaveBeenCalled())
    await Promise.resolve()

    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })

  it('says nothing for a step that went through', async () => {
    await mount('client')

    press({ key: 'z', metaKey: true })
    await vi.waitFor(() => expect(replays.undoClient).toHaveBeenCalled())
    await Promise.resolve()

    expect(enqueueSnackbar).not.toHaveBeenCalled()
  })
})

describe('on Home', () => {
  it('does nothing', async () => {
    await mount(undefined)

    press({ key: 'z', metaKey: true })

    expect(ran()).toEqual([])
  })
})
