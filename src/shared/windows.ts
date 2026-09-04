import { IpcEvent, IpcEventPayloadMap } from '@shared'
import { BrowserWindow } from 'electron'

interface WindowsObject {
  main: BrowserWindow | null
  server: BrowserWindow | null
}

export interface WindowsOpen {
  main: boolean
  server: boolean
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
