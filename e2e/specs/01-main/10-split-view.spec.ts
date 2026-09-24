import { test, expect, resetApp } from '../../fixtures/electron-app'
import { navigateToHome, navigateToServer, splitOutServerWindow } from '../../fixtures/helpers'
import { type Page } from '@playwright/test'
import net from 'net'
import { evaluateMain } from '../../fixtures/launch'

let serverPage: Page
let serverPort: number
let master: net.Socket
const masterEvents: string[] = []

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Split View — Server in separate window', () => {
  test.afterAll(() => {
    master?.destroy()
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
    const title = await evaluateMain(() =>
      electronApp.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === 'Server')
          ?.getTitle()
      )
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
   * The second window runs the store module again. It asks main which servers
   * it holds rather than opening them, and main leaves a listener already on
   * the requested port alone besides, which `modbusServer.test.ts` holds on
   * its own. A rebind would have `ServerTCP.close` destroy every open socket,
   * and a master outside Modbux would get a FIN. Only the e2e suite sees the
   * two windows together.
   */
  test('the master keeps its connection through the window opening', async () => {
    expect(masterEvents).toEqual([])
    expect(master.readyState).toBe('open')
  })

  /**
   * 0 is a port number the way "any" is a name, and `ModbusServer.setPort`
   * refuses it. The message is addressed to the window showing the server, and
   * `MessageReceiver` listens in both: unaddressed it was a snackbar in each,
   * and the server window returning early instead left the field snapping back
   * to its old port with nothing said where the user was looking.
   */
  test('a refused port reports in the window showing the server', async () => {
    const portInput = serverPage.getByTestId('server-port-input').locator('input')
    await portInput.click()
    await portInput.selectText()
    await portInput.pressSequentially('0')
    await portInput.blur()

    await expect(serverPage.locator('.notistack-SnackbarContainer')).toContainText(
      'A server needs a port between 1 and 65535',
      { timeout: 5000 }
    )
    await expect(portInput).toHaveValue(String(serverPort))
  })

  test('close server window and verify main returns to normal', async ({
    electronApp,
    mainPage
  }) => {
    await evaluateMain(() =>
      electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === 'Server')
          ?.close()
      })
    )
    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
  })
})
