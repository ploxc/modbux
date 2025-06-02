// renderer/ipcEvents.ts

import { IpcRendererListener } from '@electron-toolkit/preload'
import type { IpcEvent, IpcEventPayloadMap } from '@shared'

/**
 * Send an IPC event from the renderer to the main process.
 * - E must be one of the keys in IpcEvent.
 * - args must match the tuple defined in IpcEventPayloadMap[E].
 */
export const sendEvent = <E extends IpcEvent>(event: E, ...args: IpcEventPayloadMap[E]): void => {
  window.electron.ipcRenderer.send(event, ...args)
}

/**
 * Register a listener for an IPC event in the renderer.
 * - E must be one of the keys in IpcEvent.
 * - listener receives the payload tuple defined in IpcEventPayloadMap[E].
 *
 * Returns a function that removes this specific listener.
 */
export const onEvent = <E extends IpcEvent>(
  event: E,
  listener: (...args: IpcEventPayloadMap[E]) => void
): (() => void) => {
  const wrapped: IpcRendererListener = (_ev, ...args) => {
    listener(...(args as IpcEventPayloadMap[E]))
  }
  return window.electron.ipcRenderer.on(event, wrapped)
}

/**
 * Register a one-time listener for an IPC event.
 * - E must be one of the keys in IpcEvent.
 * - listener receives the payload tuple defined in IpcEventPayloadMap[E].
 *
 * Returns a function that removes this listener if it hasn’t fired yet.
 */
export const onceEvent = <E extends IpcEvent>(
  event: E,
  listener: (...args: IpcEventPayloadMap[E]) => void
): (() => void) => {
  const wrapped: IpcRendererListener = (_ev, ...args) => {
    listener(...(args as IpcEventPayloadMap[E]))
  }
  return window.electron.ipcRenderer.once(event, wrapped)
}
