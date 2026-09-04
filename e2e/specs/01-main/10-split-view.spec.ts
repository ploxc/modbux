import { test, expect } from '../../fixtures/electron-app'
import { navigateToHome, navigateToServer, splitOutServerWindow } from '../../fixtures/helpers'
import { type Page } from '@playwright/test'
import net from 'net'

let serverPage: Page
let serverPort: number
let master: net.Socket
const masterEvents: string[] = []

test.describe.serial('Split View — Server in separate window', () => {
  test.afterAll(async ({ electronApp }) => {
    master?.destroy()
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .filter((w) => w.getTitle() === 'Server')
        .forEach((w) => w.close())
    })
  })

  test('read the server port, then navigate to home', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    serverPort = Number(
      await mainPage.getByTestId('server-port-input').locator('input').inputValue()
    )
    expect(serverPort).toBeGreaterThan(0)
    await navigateToHome(mainPage)
  })

  test('a master connects to the server before the window opens', async () => {
    master = net.connect(serverPort, '127.0.0.1')
    await new Promise<void>((resolve, reject) => {
      master.once('connect', resolve)
      master.once('error', reject)
    })
    master.on('close', () => masterEvents.push('closed'))
  })

  test('open split view from Home', async ({ electronApp, mainPage }) => {
    serverPage = await splitOutServerWindow(electronApp, mainPage)
    await serverPage.waitForTimeout(500)
    const title = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Server')
        ?.getTitle()
    )
    expect(title).toBe('Server')
  })

  test('main window shows client (home button hidden)', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('connect-btn')).toBeVisible()
    await expect(mainPage.getByTestId('home-btn')).not.toBeVisible()
  })

  test('server window shows server interface', async () => {
    await expect(serverPage.getByTestId('section-coils')).toBeVisible()
    await expect(serverPage.getByTestId('section-holding_registers')).toBeVisible()
  })

  /**
   * The second window runs the store module again, so `init` calls
   * `createServer` for every uuid. When that rebound the listener,
   * `ServerTCP.close` destroyed every open socket and a master outside Modbux
   * got a FIN. Only the e2e suite can see this: it takes two windows.
   */
  test('the master keeps its connection through the window opening', async () => {
    expect(masterEvents).toEqual([])
    expect(master.readyState).toBe('open')
  })

  test('close server window and verify main returns to normal', async ({
    electronApp,
    mainPage
  }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === 'Server')
        ?.close()
    })
    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
  })
})
