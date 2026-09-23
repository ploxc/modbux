import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import {
  addRegister,
  cleanServerState,
  navigateToHome,
  splitOutServerWindow
} from '../../fixtures/helpers'
import { launchElectron, evaluateMain } from '../../fixtures/launch'

let app: ElectronApplication
let page: Page

async function launchApp(clearStorage: boolean): Promise<void> {
  // Cleared first, so the search below has to find this launch's own window
  // rather than passing on the one the previous launch left here.
  page = undefined as unknown as Page
  app = await launchElectron()
  if (clearStorage) {
    await evaluateMain(() =>
      app.evaluate((ctx) =>
        ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
      )
    )
  }
  let searchCount = 0
  while (searchCount < 10) {
    searchCount++
    const found = await evaluateMain(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
      )
    )
    const [firstWindow] = app.windows()
    if (found && firstWindow && app.windows().length === 1) {
      page = firstWindow
      break
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!page) throw new Error('Modbux main window not found!')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

/**
 * Both windows hold the server store and both persist it to one key, so the
 * copy that writes last is the one the next launch reads. A generator keeps the
 * main window's copy writing, which is what made the split out window's
 * register go missing.
 */
test.describe.serial('A register added in the split out server window', () => {
  let serverPage: Page

  test.afterAll(async () => {
    if (app) await app.close()
  })

  test('a generator in the main window, then the split', async () => {
    await launchApp(true)
    await cleanServerState(page)
    await addRegister(page, {
      address: 0,
      registerType: 'holding_registers',
      dataType: 'UINT16',
      mode: 'generator',
      min: '0',
      max: '1000',
      interval: '1'
    })
    await navigateToHome(page)

    serverPage = await splitOutServerWindow(app, page)
    await serverPage.waitForTimeout(1000)
  })

  test('a register added in the split out window', async () => {
    await addRegister(serverPage, {
      address: 77,
      registerType: 'holding_registers',
      dataType: 'UINT16',
      mode: 'fixed',
      value: '42'
    })
    await expect(serverPage.getByTestId('server-reg-value-holding_registers-77')).toHaveText('42')
    // The generator fires every second, and each tick is a write from the
    // window that is not showing the server.
    await serverPage.waitForTimeout(4000)
  })

  test('the split window closes and the main window keeps it', async () => {
    await evaluateMain(() =>
      app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()
          .filter((w) => w.getTitle() === 'Server')
          .forEach((w) => w.close())
      })
    )
    await page.waitForTimeout(3000)
  })

  test('it is still there after a restart', async () => {
    await app.close()
    await new Promise((r) => setTimeout(r, 1000))
    await launchApp(false)

    await page.getByTestId('home-server-btn').click()
    await expect(page.getByTestId('server-reg-value-holding_registers-77')).toHaveText('42')
  })
})
