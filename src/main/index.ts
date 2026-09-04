import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initIpc, onIpcEvent } from './ipc'
import { AppState } from './state'
import { ModbusClient } from './modules/modbusClient'
import os from 'os'
import { ModbusServer } from './modules/modbusServer'
import { Windows } from '@shared'

if (is.dev && os.platform() === 'darwin') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

const windows = new Windows()

// Initialize the app state
const appState = new AppState()

// Initialize the modbus client
const client = new ModbusClient({ appState, windows })

// Initialize the modbus server
const server = new ModbusServer({ windows })

// IPC
initIpc(app, appState, client, server, windows)

/**
 * Say which path took the app down.
 *
 * A process that quits leaves nothing behind that names the reason, and the
 * two callers of app.quit() below look identical from the outside: an exit
 * with code 0. On CI these lines land in the log the e2e fixture keeps beside
 * the traces, and in dev they land in the terminal.
 */
const lifecycle = (message: string): void => console.error(`[lifecycle] ${message}`)

// Single instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  lifecycle('another instance holds the single instance lock, quitting')
  app.quit()
} else {
  /**
   * Someone launched Modbux again. Show them the app they already have.
   *
   * On macos `window-all-closed` does not quit, so the app can be sitting in
   * the dock with no window at all, and then there is nothing to focus and one
   * to create. Everywhere else the app is gone before a second launch can
   * happen, so only macos reaches the second branch.
   */
  app.on('second-instance', () => {
    if (windows.main === null) {
      createWindow()
      return
    }
    if (windows.main.isMinimized()) windows.main.restore()
    windows.main.focus()
  })
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1480,
    height: 1000,
    minWidth: 820,
    minHeight: 800,
    autoHideMenuBar: true,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    },
    title: 'Modbux',
    icon: join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#181818'
  })

  windows.main = mainWindow

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.on('close', () => {
    windows.server?.close()
  })

  /**
   * Let go of the handle the moment the window is destroyed, the way the server
   * window already does.
   *
   * `close` is too early: the window is still alive there and a listener may
   * still cancel it. Every method on a destroyed `BrowserWindow` throws, so a
   * handle kept past this point is one that costs whoever reads it next.
   */
  mainWindow.on('closed', () => {
    windows.main = null
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

//
//
// SERVER WINDOW
onIpcEvent('open_server_window', () => {
  if (!windows.main) return
  if (windows.server) return

  windows.server = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 820,
    minHeight: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['is-server-window']
    },
    title: 'Server',
    backgroundColor: '#181818'
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    windows.server.loadURL(`${process.env['ELECTRON_RENDERER_URL']}`)
  } else {
    windows.server.loadFile(join(__dirname, '../renderer/index.html'))
  }

  windows.server.on('close', () => {
    windows.server = null
  })
})

let splash: BrowserWindow | null = null

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if (os.platform() !== 'darwin') {
    splash = new BrowserWindow({
      width: 400,
      height: 300,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      resizable: false,
      show: false,
      backgroundColor: '#181818',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    splash.loadFile(join(__dirname, '../../resources/splash.html')).catch(console.error)

    splash.on('ready-to-show', () => {
      splash?.show()
    })
  }

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.harted')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    const id = window.id
    lifecycle(`window ${id} created`)
    window.on('closed', () => lifecycle(`window ${id} closed`))

    // A window that goes away on its own takes its reason with it. These three
    // are the ways that happens without anyone calling close(): the renderer
    // dies, the page never loads, or it stops answering.
    window.webContents.on('render-process-gone', (_e, details) =>
      lifecycle(`window ${id} renderer gone: reason=${details.reason} exit=${details.exitCode}`)
    )
    window.webContents.on('did-fail-load', (_e, code, description, url) =>
      lifecycle(`window ${id} failed to load ${url}: ${code} ${description}`)
    )
    window.on('unresponsive', () => lifecycle(`window ${id} unresponsive`))

    optimizer.watchWindowShortcuts(window)
  })

  const mainWindow = createWindow()

  mainWindow.once('ready-to-show', () => {
    if (splash) splash.close()
    splash = null
  })

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  lifecycle('every window is closed')
  windows.server = null
  if (process.platform !== 'darwin') {
    lifecycle('quitting because no window is left')
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
