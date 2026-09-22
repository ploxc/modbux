import { meme } from '@renderer/components/shared/inputs/meme'
import { redoClient, undoClient } from '@renderer/context/clientUndo'
import { useLayoutZustand } from '@renderer/context/layout.zustand'
import { redoServer, undoServer } from '@renderer/context/serverUndo'
import { UndoOutcome } from '@renderer/context/undo.zustand.types'
import { useEffect } from 'react'

/** The keys, on any platform: Cmd or Ctrl with Z, with Shift+Z or Y for redo. */
export const undoKeyOf = (event: KeyboardEvent): 'undo' | 'redo' | undefined => {
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
export const holdsText = (element: Element | null): boolean => {
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLElement && element.isContentEditable) return true
  if (!(element instanceof HTMLInputElement)) return false
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(element.type)
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
      void replays[appType][direction]()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return (): void => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  return null
})

export default UndoKeys
