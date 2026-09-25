import { meme } from '@renderer/components/shared/inputs/meme'
import { redoClient, undoClient } from '@renderer/context/clientUndo'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { redoServer, undoServer } from '@renderer/context/serverUndo'
// Carries the server steps across the split, in both windows this listener runs in.
import '@renderer/context/serverUndoHandover'
import { UndoOutcome } from '@renderer/context/undo.zustand.types'
import { useSnackbar, VariantType } from 'notistack'
import { useEffect } from 'react'

/** The keys, on any platform: Cmd or Ctrl with Z, with Shift+Z or Y for redo. */
const undoKeyOf = (event: KeyboardEvent): 'undo' | 'redo' | undefined => {
  if (!event.metaKey && !event.ctrlKey) return undefined
  const key = event.key.toLowerCase()
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !event.shiftKey) return 'redo'
  return undefined
}

/**
 * Whether the element holds text of its own to undo, which is where the key
 * stays: the field's history runs, and what it puts back reaches the store
 * through the field's setter.
 */
const holdsText = (element: Element | null): boolean => {
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(element.type)
}

/**
 * What each outcome tells the user, or nothing for one that says it by
 * happening. A refused step stays on its stack, so the message says what to
 * do for it to go through.
 */
const undoMessage = (
  outcome: UndoOutcome,
  direction: 'undo' | 'redo'
): { message: string; variant: VariantType } | undefined => {
  switch (outcome) {
    // A plain refusal was said already by what refused it: main answers a
    // payload it refuses with a message of its own, and the port setter says
    // which port is taken.
    case 'done':
    case 'busy':
    case 'refused':
      return undefined
    case 'empty':
      return { message: `Nothing to ${direction}`, variant: 'info' }
    case 'refused-connected':
      return { message: `Disconnect to ${direction} a connection setting`, variant: 'warning' }
    case 'refused-gone':
      return {
        message: `Nothing to ${direction} there: that server or coil is gone`,
        variant: 'warning'
      }
  }
}

const replays: Record<'client' | 'server', Record<'undo' | 'redo', () => Promise<UndoOutcome>>> = {
  client: { undo: undoClient, redo: redoClient },
  server: { undo: undoServer, redo: redoServer }
}

/**
 * Runs undo and redo on the stack of the view on screen: the client's, the
 * server's, or nothing on Home.
 *
 * A real key reaches this listener with Electron's default Edit menu in place,
 * measured on macOS with `osascript`. The listener is on `window` in the
 * capture phase, so the grid's own key handling does not see the key first.
 */
const UndoKeys = meme((): null => {
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const direction = undoKeyOf(event)
      if (!direction) return
      if (holdsText(document.activeElement)) return
      // A dialog is filled from what was on screen when it opened, and its
      // buttons act on that. Replaying behind it would leave them acting on a
      // register or a type that is not there any more.
      if (document.querySelector('[role="dialog"]')) return

      const appType = useLayoutZustand.getState().appType
      if (!appType) return

      event.preventDefault()
      void replays[appType][direction]().then((outcome) => {
        const said = undoMessage(outcome, direction)
        if (said) enqueueSnackbar(said)
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return (): void => window.removeEventListener('keydown', onKeyDown, true)
  }, [enqueueSnackbar])

  return null
})

export default UndoKeys
