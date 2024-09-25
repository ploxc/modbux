import { IpcEvent } from '@shared'
import { BrowserWindow } from 'electron'

interface WindowsObject {
  main: BrowserWindow | null
  server: BrowserWindow | null
}

export interface WindowsOpen {
  main: boolean,
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

  public send = <A extends Array<any>>(event: IpcEvent, ...args:A) => {
    Object.values(this._windows).forEach((w) => w?.webContents.send(event,...args))
  }

  // Main window access
  get main() {
    return this._windows.main
  }
  set main(main) {
    this._windows.main = main
    this._sendUpdate()
  }

  // Server window access
  get server() {
    return this._windows.server
  }
  set server(server) {
    this._windows.server = server
    this._sendUpdate()
  }

  // Send update when windows change
  private _sendUpdate() {
    const windowsOpen = {
      main:!!this._windows.main,
      server:!!this._windows.server
    }
    Object.values(this._windows).forEach((w) => w?.webContents.send(IpcEvent.WindowUpdate, windowsOpen))
  }  
}
