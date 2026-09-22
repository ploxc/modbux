import { onEvent } from '@renderer/events'
import { useUndoZustand } from './undo.zustand'
import { emptyStack } from './undo.zustand.helpers'
import { ServerUndoStep, UndoStack } from './undo.zustand.types'

/**
 * Where the server steps wait while the server view moves between windows.
 *
 * The steps go with the view: written by the window giving it up, read by the
 * window taking it. Both windows are one origin, so both read this key.
 * Measured over three rounds each way: the main window writing on
 * `window_update {server: true}` is read by the split out window at module
 * load, and the split out window writing on `pagehide` is read by the main
 * window on `window_update {server: false}`.
 */
export const SERVER_UNDO_STORAGE_KEY = 'server.undo'

type Writer = 'main' | 'server'

const isServerWindow = window.api.isServerWindow

/**
 * Writes the steps with the window that wrote them, because the main window
 * takes back only what the split out window wrote: a split out window that
 * crashed before `pagehide` leaves the main window's own steps in the key,
 * and those describe the store from before the split.
 */
const handOver = (writer: Writer): void => {
  try {
    const { server } = useUndoZustand.getState()
    localStorage.setItem(SERVER_UNDO_STORAGE_KEY, JSON.stringify({ writer, ...server }))
  } catch (error) {
    console.error('The server undo steps were not handed over:', error)
  }
}

/**
 * Takes the steps `writer` handed over, or none.
 *
 * Only the shape is checked: the key is written by this app a moment before it
 * is read, and a step that no longer fits the store is refused by its replay.
 */
const takeOver = (writer: Writer): void => {
  let stack: UndoStack<ServerUndoStep> = emptyStack()
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SERVER_UNDO_STORAGE_KEY) ?? 'null')
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'writer' in parsed &&
      parsed.writer === writer &&
      'past' in parsed &&
      'future' in parsed &&
      Array.isArray(parsed.past) &&
      Array.isArray(parsed.future)
    ) {
      stack = { past: parsed.past, future: parsed.future, openKey: undefined }
    }
  } catch (error) {
    console.error('The server undo steps were not taken over:', error)
  }
  useUndoZustand.getState().setServer(stack)
}

if (isServerWindow) {
  takeOver('main')
  window.addEventListener('pagehide', () => handOver('server'))
} else {
  // History does not outlive a launch, and the key is the one place it could.
  localStorage.removeItem(SERVER_UNDO_STORAGE_KEY)
  // Main sends `window_update` whenever a window is set, so `server: false`
  // also arrives at launch. Only a view this window handed away comes back.
  let handedAway = false
  onEvent('window_update', ({ server }) => {
    if (server) {
      if (handedAway) return
      handedAway = true
      handOver('main')
      useUndoZustand.getState().setServer(emptyStack())
      return
    }
    if (!handedAway) return
    handedAway = false
    takeOver('server')
  })
}
