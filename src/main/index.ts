import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { initIpc } from './ipc'
import { AppState } from './state'
import { ModbusClient } from './modules/modbusClient'
import os from 'os'
import { ModbusServer } from './modules/mobusServer'

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

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    minWidth: 640,
    minHeight: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    title: 'Modbux',
    icon: join(__dirname, 'assets', 'icon.png')
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Initialize the app state
  const appState = new AppState()

  // Initialize the modbus client
  const client = new ModbusClient({ appState, mainWindow })

  // Initialize the modbus server
  const server = new ModbusServer({ mainWindow })

  // IPC
  initIpc(appState, client, server)
}

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
