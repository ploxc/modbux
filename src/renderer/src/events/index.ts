// renderer/ipcEvents.ts

import { IpcRendererListener } from '@electron-toolkit/preload'
import type { EventToMain, EventToRenderer, IpcEventPayloadMap } from '@shared'

/**
 * Send an IPC event from the renderer to the main process.
 * - E must be one of `EVENTS_TO_MAIN`, which is the direction this goes.
 * - args must match the tuple defined in IpcEventPayloadMap[E].
 */
export const sendEvent = <E extends EventToMain>(
  event: E,
  ...args: IpcEventPayloadMap[E]
): void => {
  window.electron.ipcRenderer.send(event, ...args)
}

/**
 * Register a listener for an IPC event in the renderer.
 * - E must be one of `EVENTS_TO_RENDERER`, which is the direction this hears.
 * - listener receives the payload tuple defined in IpcEventPayloadMap[E].
 *
 * Returns a function that removes this specific listener.
 */
export const onEvent = <E extends EventToRenderer>(
  event: E,
  listener: (...args: IpcEventPayloadMap[E]) => void
): (() => void) => {
  const wrapped: IpcRendererListener = (_ev, ...args) => {
    listener(...(args as IpcEventPayloadMap[E]))
  }
  return window.electron.ipcRenderer.on(event, wrapped)
}
