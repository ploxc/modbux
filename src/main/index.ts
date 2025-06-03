import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initIpc, onIpcEvent } from './ipc'
import { AppState } from './state'
import { ModbusClient } from './modules/modbusClient'
import os from 'os'
import { ModbusServer } from './modules/mobusServer'
import { Windows } from '@shared'

if (is.dev && os.platform() === 'darwin') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-software-rasterizer')
}

// const portScanTest = async () => {
//   for (let i = 450; i < 504; i++) {
//     console.log(`testing port from ${i}...`)
//     try {
//       const result = await portscanner.checkPortStatus(i, '192.168.3.44')
//       if (result === 'open') console.log(`============================================ port ${i} is open`)
//     } catch (error) {
//       console.log(i, (error as Error).message)
//     }
//   }
// }

const windows = new Windows()

// Initialize the app state
const appState = new AppState()

// Initialize the modbus client
const client = new ModbusClient({ appState, windows })

// Initialize the modbus server
const server = new ModbusServer({ windows })

// IPC
initIpc(app, appState, client, server)

// Single instance
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // Someone tried to run a second instance, we should focus our window.
    if (windows.main) {
      if (windows.main.isMinimized()) windows.main.restore()
      windows.main.focus()
    }
  })
}

function createWindow(): void {
  // Create the browser window.
  windows.main = new BrowserWindow({
    width: 1480,
    height: 1000,
    minWidth: 640,
    minHeight: 800,
    autoHideMenuBar: true,
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

  windows.main.on('ready-to-show', () => {
    if (windows.main === null) return
    windows.main.show()
  })

  windows.main.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  windows.main.on('close', () => {
    windows.server?.close()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    windows.main.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    windows.main.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

//
//
// SERVER WINDOW
onIpcEvent('open_server_window', () => {
  if (!windows.main) return
  if (windows.server) return

  windows.server = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
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

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.harted')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

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
  windows.server = null
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
