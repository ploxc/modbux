import { test, expect } from '../../fixtures/electron-app'
import { navigateToHome } from '../../fixtures/helpers'
import { type Page } from '@playwright/test'

let serverPage: Page

test.describe.serial('Split View — Server in separate window', () => {
  test('navigate to home', async ({ mainPage }) => {
    await navigateToHome(mainPage)
  })

  test('open split view from Home', async ({ electronApp, mainPage }) => {
    await mainPage.getByTestId('home-split-btn').click()
    serverPage = await electronApp.waitForEvent('window', { timeout: 10000 })
    await serverPage.waitForLoadState('domcontentloaded')
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
  })

  test('server window shows server interface', async () => {
    await serverPage.waitForTimeout(1000)
    await expect(serverPage.getByTestId('section-coils')).toBeVisible()
    await expect(serverPage.getByTestId('section-holding_registers')).toBeVisible()
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
    await mainPage.waitForTimeout(1000)
    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
  })
})
