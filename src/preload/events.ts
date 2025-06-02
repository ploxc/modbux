// preload/events.ts

import type { IpcEvent, IpcEventPayloadMap, Windows } from '@shared'
import { ipcRenderer } from 'electron'

/**
 * Register a listener for an IPC event.
 * - E must be one of the keys in IpcEvent.
 * - listener receives the payload tuple defined in IpcEventPayloadMap[E].
 */
const onEvent = <E extends IpcEvent>(
  event: E,
  listener: (...args: IpcEventPayloadMap[E]) => void
): void => {
  ipcRenderer.on(event, (_ev, ...args) => {
    listener(...(args as IpcEventPayloadMap[E]))
  })
}

/**
 * Register a one-time listener for an IPC event.
 * - E must match a key in IpcEvent.
 * - listener receives the payload tuple for that event.
 */
const onceEvent = <E extends IpcEvent>(
  event: E,
  listener: (...args: IpcEventPayloadMap[E]) => void
): void => {
  ipcRenderer.once(event, (_ev, ...args) => {
    listener(...(args as IpcEventPayloadMap[E]))
  })
}

/**
 * Remove all listeners for a specific IPC event.
 */
const offEvent = <E extends IpcEvent>(event: E): void => {
  ipcRenderer.removeAllListeners(event)
}

const sendEvent: typeof Windows.prototype.send = (event, ...args) => {
  ipcRenderer.send(event, ...args)
}

export const events = {
  on: onEvent,
  once: onceEvent,
  off: offEvent,
  send: sendEvent
}

export type Events = typeof events
