import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'
import { setupServerConfig, selectUnitId } from '../../fixtures/helpers'
import { SERVER_1_UNIT_0 } from '../../fixtures/test-data'

// This test manages its own app lifecycle (no shared fixture)
let app: ElectronApplication
let page: Page

async function launchApp(clearStorage = true): Promise<void> {
  app = await electron.launch({
    args: [resolve(__dirname, '../../../out/main/index.js')]
  })
  if (clearStorage) {
    await app.evaluate((ctx) =>
      ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
    )
  }
  // Wait for main window (check BrowserWindow title, not HTML title)
  let searchCount = 0
  while (searchCount < 10) {
    searchCount++
    const found = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().some((w) => w.getTitle() === 'Modbux')
    )
    if (found && app.windows().length === 1) {
      page = app.windows()[0]
      break
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  if (!page) throw new Error('Modbux main window not found!')
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(500)
}

test.describe.serial('Persistence — State survives app restart', () => {
  test.afterAll(async () => {
    if (app) await app.close()
  })

  // Phase 1: Set up state
  test('launch app and configure server', async () => {
    await launchApp(true) // clean start
    // Navigate to server
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)
    // Set up server config
    await setupServerConfig(page, SERVER_1_UNIT_0, true)
  })

  test('configure client connection settings', async () => {
    // Navigate to client
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-client-btn').click()
    await page.waitForTimeout(600)
    // Fill in connection config
    const hostInput = page.getByTestId('tcp-host-input').locator('input')
    await hostInput.fill('192.168.1.100')
    const portInput = page.getByTestId('tcp-port-input').locator('input')
    await portInput.fill('5020')
    const unitIdInput = page.getByTestId('client-unitid-input').locator('input')
    await unitIdInput.fill('5')
    await page.waitForTimeout(500) // Let zustand persist
  })

  // Phase 2: Close and reopen
  test('close app', async () => {
    await app.close()
    await new Promise((r) => setTimeout(r, 1000)) // Wait for cleanup
  })

  test('reopen app WITHOUT clearing storage', async () => {
    await launchApp(false) // Don't clear localStorage
  })

  // Phase 3: Verify persisted state
  test('verify client connection settings persisted', async () => {
    // Navigate to client
    await page.getByTestId('home-client-btn').click()
    await page.waitForTimeout(600)
    const hostInput = page.getByTestId('tcp-host-input').locator('input')
    expect(await hostInput.inputValue()).toBe('192.168.1.100')
    const portInput = page.getByTestId('tcp-port-input').locator('input')
    expect(await portInput.inputValue()).toBe('5020')
    const unitIdInput = page.getByTestId('client-unitid-input').locator('input')
    expect(await unitIdInput.inputValue()).toBe('5')
  })

  test('verify connection state is disconnected after restart', async () => {
    await expect(page.getByTestId('connect-btn')).toContainText('Connect')
  })

  test('verify server config persisted', async () => {
    await page.getByTestId('home-btn').click()
    await page.waitForTimeout(600)
    await page.getByTestId('home-server-btn').click()
    await page.waitForTimeout(600)
    // Check server name
    const nameField = page.getByTestId('server-name-input').locator('input')
    expect(await nameField.inputValue()).toBe('Main Server')
    // Check register counts
    await selectUnitId(page, '0')
    await expect(page.getByTestId('section-holding_registers')).toContainText('(9)')
    await expect(page.getByTestId('section-input_registers')).toContainText('(3)')
    await expect(page.getByTestId('section-coils')).toContainText('(16)')
    await expect(page.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  test('verify server port persisted', async () => {
    const portInput = page.getByTestId('server-port-input').locator('input')
    expect(await portInput.inputValue()).toBe('502')
  })
})
