/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: vi.fn()
}))

import { Windows } from '../windows'

const createMockWindow = () => ({
  isDestroyed: vi.fn(() => false),
  webContents: {
    isDestroyed: vi.fn(() => false),
    send: vi.fn()
  }
})

describe('Windows', () => {
  let windows: Windows

  beforeEach(() => {
    windows = new Windows()
  })

  describe('send', () => {
    it('sends to all open windows', () => {
      const mainWin = createMockWindow()
      const serverWin = createMockWindow()
      windows.main = mainWin as never
      windows.server = serverWin as never

      windows.send('client_state', {
        connectState: 'connected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      } as never)

      expect(mainWin.webContents.send).toHaveBeenCalledWith(
        'client_state',
        expect.objectContaining({ connectState: 'connected' })
      )
      expect(serverWin.webContents.send).toHaveBeenCalledWith(
        'client_state',
        expect.objectContaining({ connectState: 'connected' })
      )
    })

    it('skips null windows', () => {
      // No windows set — should not throw
      windows.send('client_state', {
        connectState: 'disconnected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      } as never)
    })

    it('skips destroyed windows', () => {
      const win = createMockWindow()
      windows.main = win as never
      // Clear calls from setter's _sendUpdate
      win.webContents.send.mockClear()

      win.isDestroyed.mockReturnValue(true)
      windows.send('client_state', {
        connectState: 'disconnected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      } as never)

      expect(win.webContents.send).not.toHaveBeenCalled()
    })

    it('skips windows with destroyed webContents', () => {
      const win = createMockWindow()
      windows.main = win as never
      // Clear calls from setter's _sendUpdate
      win.webContents.send.mockClear()

      win.webContents.isDestroyed.mockReturnValue(true)
      windows.send('client_state', {
        connectState: 'disconnected',
        polling: false,
        scanningUnitIds: false,
        scanningRegisters: false
      } as never)

      expect(win.webContents.send).not.toHaveBeenCalled()
    })

    it('catches errors from destroyed windows gracefully', () => {
      const win = createMockWindow()
      win.webContents.send.mockImplementation(() => {
        throw new Error('Object has been destroyed')
      })
      // Force past the guard checks
      windows.main = win as never

      // Should not throw
      expect(() =>
        windows.send('client_state', {
          connectState: 'disconnected',
          polling: false,
          scanningUnitIds: false,
          scanningRegisters: false
        } as never)
      ).not.toThrow()
    })
  })

  describe('an addressed send', () => {
    const message = { message: 'refused', variant: 'error', error: null } as never

    it('reaches the contents it was handed and nothing else', () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never
      windows.server = serverWindow as never
      mainWindow.webContents.send.mockClear()
      serverWindow.webContents.send.mockClear()

      windows.send('backend_message', message, mainWindow.webContents as never)

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('backend_message', message)
      expect(serverWindow.webContents.send).not.toHaveBeenCalled()
    })

    it("'main' reaches the main window while the server window is open", () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never
      windows.server = serverWindow as never
      mainWindow.webContents.send.mockClear()
      serverWindow.webContents.send.mockClear()

      windows.send('backend_message', message, 'main')

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('backend_message', message)
      expect(serverWindow.webContents.send).not.toHaveBeenCalled()
    })

    it("'serverView' reaches the server window once it exists", () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never
      windows.server = serverWindow as never
      mainWindow.webContents.send.mockClear()
      serverWindow.webContents.send.mockClear()

      windows.send('backend_message', message, 'serverView')

      expect(serverWindow.webContents.send).toHaveBeenCalledWith('backend_message', message)
      expect(mainWindow.webContents.send).not.toHaveBeenCalled()
    })

    // Unsplit there is one window, and it is the one showing the server.
    it("'serverView' is the main window while no server window exists", () => {
      const mainWindow = createMockWindow()
      windows.main = mainWindow as never
      mainWindow.webContents.send.mockClear()

      windows.send('backend_message', message, 'serverView')

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('backend_message', message)
    })

    it('says nothing when the addressee has no window', () => {
      expect(() => windows.send('backend_message', message, 'serverView')).not.toThrow()
    })

    it('skips destroyed contents', () => {
      const mainWindow = createMockWindow()
      windows.main = mainWindow as never
      mainWindow.webContents.send.mockClear()
      mainWindow.webContents.isDestroyed.mockReturnValue(true)

      windows.send('backend_message', message, 'main')

      expect(mainWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('catches a send that lands after the window is gone', () => {
      const mainWindow = createMockWindow()
      windows.main = mainWindow as never
      mainWindow.webContents.send.mockImplementation(() => {
        throw new Error('Object has been destroyed')
      })

      expect(() => windows.send('backend_message', message, 'main')).not.toThrow()
    })
  })

  /**
   * The setters send `window_update`, and they send it at the one moment a
   * window is going away, so this is where a stale handle is most likely to be
   * in the list.
   */
  describe('window_update', () => {
    it('a destroyed main window does not cost the server window its update', () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never

      mainWindow.isDestroyed.mockReturnValue(true)
      mainWindow.webContents.send.mockImplementation(() => {
        throw new Error('Object has been destroyed')
      })

      windows.server = serverWindow as never

      expect(serverWindow.webContents.send).toHaveBeenCalledWith('window_update', {
        main: true,
        server: true
      })
    })

    it('reports which windows are open', () => {
      const mainWindow = createMockWindow()
      windows.main = mainWindow as never

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('window_update', {
        main: true,
        server: false
      })
    })

    it('reports a window that was nulled as closed', () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never
      windows.server = serverWindow as never
      serverWindow.webContents.send.mockClear()

      windows.main = null

      expect(serverWindow.webContents.send).toHaveBeenCalledWith('window_update', {
        main: false,
        server: true
      })
    })
  })

  // `createIpcHandle` refuses the fourteen channels that drive main's one
  // Modbus client on this answer, so a window it cannot place has to answer
  // false rather than throw.
  describe('isMain', () => {
    it('answers for the main window and for no other', () => {
      const mainWindow = createMockWindow()
      const serverWindow = createMockWindow()
      windows.main = mainWindow as never
      windows.server = serverWindow as never

      expect(windows.isMain(mainWindow.webContents as never)).toBe(true)
      expect(windows.isMain(serverWindow.webContents as never)).toBe(false)
    })

    it('answers false with no main window', () => {
      const orphan = createMockWindow()

      expect(windows.isMain(orphan.webContents as never)).toBe(false)
    })

    // On macos the app outlives its windows, so a destroyed main window is a
    // state the handle reaches rather than a hypothetical.
    it('answers false for a destroyed main window', () => {
      const mainWindow = createMockWindow()
      windows.main = mainWindow as never
      mainWindow.isDestroyed.mockReturnValue(true)

      expect(windows.isMain(mainWindow.webContents as never)).toBe(false)
    })
  })

  describe('main getter/setter', () => {
    // ! Coverage-only: trivial initial state
    it('returns null initially', () => {
      expect(windows.main).toBeNull()
    })

    it('stores and returns the window', () => {
      const win = createMockWindow()
      windows.main = win as never
      expect(windows.main).toBe(win)
    })
  })

  describe('server getter/setter', () => {
    // ! Coverage-only: trivial initial state
    it('returns null initially', () => {
      expect(windows.server).toBeNull()
    })

    it('stores and returns the window', () => {
      const win = createMockWindow()
      windows.server = win as never
      expect(windows.server).toBe(win)
    })
  })
})
