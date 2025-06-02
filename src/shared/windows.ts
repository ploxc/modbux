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

  public send = <E extends IpcEvent>(event: E, ...args: IpcEventPayloadMap[E]): void => {
    try {
      Object.values(this._windows).forEach((w) => w?.webContents.send(event, ...args))
    } catch (error) {
      /**
       * When the window is closed on macos sending a window update will throw an error.
       * We can ignore this error because when the window is opened again,
       * the IPC event will be handled properly by the window again.
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

  // Send update when windows change
  private _sendUpdate(): void {
    const windowsOpen = {
      main: !!this._windows.main,
      server: !!this._windows.server
    }
    try {
      Object.values(this._windows).forEach((w) => w?.webContents.send('window_update', windowsOpen))
    } catch (error) {
      /**
       * When the window is closed on macos sending a window update will throw an error.
       * We can ignore this error because when the window is opened again,
       * the IPC event will be handled properly by the window again.
       */
    }
  }
}
