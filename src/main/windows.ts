import { IpcEvent, IpcEventPayloadMap } from '@shared'
import { BrowserWindow, WebContents } from 'electron'

interface WindowsObject {
  main: BrowserWindow | null
  server: BrowserWindow | null
}

/** Who an addressed event goes to. `send` without one reaches every window. */
export type IpcEventTarget = WebContents | 'main' | 'serverView'

export class Windows {
  private _windows: WindowsObject

  constructor() {
    this._windows = {
      main: null,
      server: null
    }
  }

  /**
   * Send an event to every open window, or to the one `to` names.
   *
   * Both windows load the same renderer, so both hold the client store and the
   * server store, and the listeners those stores install run in both. An event
   * that changes a store only one view draws leaves the other window writing
   * its own copy over the same key, and the copy that writes last is the one on
   * disk. That is what `to` is for.
   *
   * A `WebContents` is the window that asked. `ipcMain.handle` hands the
   * invoking contents to every handler, so a refused payload reports where it
   * came from rather than everywhere.
   *
   * `'main'` is the window the client work happens in, which never moves.
   * `'serverView'` is the window showing the server, which is the popped out
   * one while it exists and the main window otherwise, the same question
   * `PrivilegedPortModal` answers by where it is mounted.
   *
   * The guard is per window rather than around the loop, because a throw on one
   * window costs every window after it the event. `Object.values` puts `main`
   * first, so without it a stale main handle is what the server window's
   * `window_update` goes missing behind.
   */
  public send = <E extends IpcEvent>(
    event: E,
    payload: IpcEventPayloadMap[E][0],
    to?: IpcEventTarget
  ): void => {
    for (const contents of this._contentsFor(to)) {
      try {
        if (!contents.isDestroyed()) contents.send(event, payload)
      } catch (error) {
        /**
         * A window that passes the guard can still be gone by the time the send
         * lands, and on macos the app outlives its windows, so this is where
         * that shows up.
         */
      }
    }
  }

  /** The contents an event goes to, with the windows that are gone left out. */
  private _contentsFor(to?: IpcEventTarget): WebContents[] {
    if (to === undefined) {
      return Object.values(this._windows).flatMap((window) => this._liveContents(window))
    }
    if (to === 'main') return this._liveContents(this._windows.main)
    if (to === 'serverView') {
      return this._liveContents(this._windows.server ?? this._windows.main)
    }
    return [to]
  }

  private _liveContents(window: BrowserWindow | null): WebContents[] {
    if (!window || window.isDestroyed() || !window.webContents) return []
    return [window.webContents]
  }

  // Main window access
  get main(): BrowserWindow | null {
    return this._windows.main
  }
  set main(main) {
    this._windows.main = main
    this._sendUpdate()
  }

  // Server window access
  get server(): BrowserWindow | null {
    return this._windows.server
  }
  set server(server) {
    this._windows.server = server
    this._sendUpdate()
  }

  private _sendUpdate(): void {
    this.send('window_update', {
      main: !!this._windows.main,
      server: !!this._windows.server
    })
  }
}
