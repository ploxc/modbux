import { IpcEvent, IpcEventPayloadMap } from '@shared'
import { BrowserWindow, WebContents } from 'electron'

interface WindowsObject {
  main: BrowserWindow | null
  server: BrowserWindow | null
}

export class Windows {
  private _windows: WindowsObject

  constructor() {
    this._windows = {
      main: null,
      server: null
    }
  }

  /**
   * Send an event to every open window.
   *
   * The guard is per window rather than around the loop, because a throw on one
   * window costs every window after it the event. `Object.values` puts `main`
   * first, so without it a stale main handle is what the server window's
   * `window_update` goes missing behind.
   */
  public send = <E extends IpcEvent>(event: E, ...args: IpcEventPayloadMap[E]): void => {
    try {
      Object.values(this._windows).forEach((w) => {
        if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
          w.webContents.send(event, ...args)
        }
      })
    } catch (error) {
      /**
       * A window that passes the guard can still be gone by the time the send
       * lands, and on macos the app outlives its windows, so this is where that
       * shows up.
       */
    }
  }

  /**
   * Send an event to one addressee.
   *
   * A `WebContents` is the window that asked: `ipcMain.handle` hands the
   * invoking contents to every handler, so a refused payload reports where it
   * came from rather than everywhere.
   *
   * `'main'` is the window the client work happens in, which never moves.
   * `'serverView'` is the window showing the server, which is the popped out
   * one while it exists and the main window otherwise, the same question
   * `PrivilegedPortModal` answers by where it is mounted.
   *
   * Both windows render `MessageReceiver`, so without an addressee a message
   * about one view snackbars in the other as well.
   */
  public sendTo = <E extends IpcEvent>(
    target: WebContents | 'main' | 'serverView',
    event: E,
    ...args: IpcEventPayloadMap[E]
  ): void => {
    const contents = this._contentsFor(target)
    try {
      if (contents && !contents.isDestroyed()) contents.send(event, ...args)
    } catch (error) {
      // Gone between the guard and the send, the same way `send` describes.
    }
  }

  private _contentsFor(target: WebContents | 'main' | 'serverView'): WebContents | null {
    if (target === 'main') return this._windows.main?.webContents ?? null
    if (target === 'serverView') {
      const window = this._windows.server ?? this._windows.main
      return window?.webContents ?? null
    }
    return target
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
