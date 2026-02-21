/**
 * Hardware E2E Test — iEM3000 RTU reconnect after app restart
 *
 * Verifies that after closing and reopening the app, the persisted
 * RTU settings allow a successful reconnect and read — twice.
 *
 * Requires a physical Arduino Uno running tools/arduino/iem3000.ino
 * connected via USB serial (9600 baud, 8N1, Slave ID 1).
 *
 * Run headed:
 *   npx playwright test e2e/specs/99-hardware/02-iem3000-reconnect.spec.ts --headed
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { resolve } from 'path'
import {
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  loadClientConfig,
  scrollCell
} from '../../fixtures/helpers'

const MAIN_JS = resolve(__dirname, '../../../out/main/index.js')
const CLIENT_CONFIG = resolve(__dirname, '../../fixtures/config-files/client-iem3000.json')

let app: ElectronApplication
let page: Page

async function launchApp(clearStorage = true): Promise<void> {
  app = await electron.launch({ args: [MAIN_JS] })
  if (clearStorage) {
    await app.evaluate((ctx) =>
      ctx.session.defaultSession.clearStorageData({ storages: ['localstorage'] })
    )
  }
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

async function connectAndRead(): Promise<void> {
  // Connect
  await page.getByTestId('connect-btn').click()
  await expect(page.getByTestId('connect-btn')).toContainText('Disconnect', { timeout: 10_000 })

  // Wait for Arduino DTR reset
  await page.waitForTimeout(2000)

  // Enable read-config and read
  await enableReadConfiguration(page)

  await page.getByTestId('read-btn').click()
  await page.waitForTimeout(5000)

  const rowCount = await page.locator('.MuiDataGrid-row').count()
  expect(rowCount).toBeGreaterThan(0)
}

async function verifyPhaseCurrents(): Promise<void> {
  // I1 ~18.5A (±3.5 → 15–22)
  const i1 = Number(await scrollCell(page, 2999, 'word_float'))
  expect(i1).toBeGreaterThanOrEqual(15)
  expect(i1).toBeLessThanOrEqual(22)
}

async function closeApp(): Promise<void> {
  // Disable read-config before closing
  await disableReadConfiguration(page)

  // Disconnect
  await page.getByTestId('connect-btn').click()
  await expect(page.getByTestId('connect-btn')).toContainText('Connect', { timeout: 5000 })

  await app.close()
  await new Promise((r) => setTimeout(r, 1000))
}

test.describe.serial('Hardware — iEM3000 RTU reconnect after restart', () => {
  test.afterAll(async () => {
    if (app) await app.close().catch(() => {})
  })

  // ─── Session 1: Initial setup with manual COM selection ──────────

  test('session 1 — launch and configure RTU', async () => {
    await launchApp(true)

    // Navigate to client
    await page.getByTestId('home-client-btn').click()
    await expect(page.getByTestId('protocol-tcp-btn')).toBeVisible({ timeout: 5000 })

    // Switch to RTU
    await page.getByTestId('protocol-rtu-btn').click()

    // Set unit ID
    const unitIdInput = page.getByTestId('client-unitid-input').locator('input')
    await unitIdInput.click({ clickCount: 3 })
    await unitIdInput.fill('1')

    // Set baud rate
    await page.getByTestId('rtu-baudrate-select').click()
    await page.getByRole('option', { name: '9600' }).click()
  })

  test('session 1 — pause for COM port selection', async () => {
    // eslint-disable-next-line no-console
    console.log(
      '\n╔══════════════════════════════════════════════════════════════╗\n' +
        '║  MANUAL STEP: Select the Arduino COM port                   ║\n' +
        '║                                                              ║\n' +
        '║  1. Click the refresh button (↻) next to the COM port       ║\n' +
        '║  2. Select the Arduino serial port from the dropdown         ║\n' +
        '║  3. Click "Resume" in the Playwright Inspector               ║\n' +
        '╚══════════════════════════════════════════════════════════════╝\n'
    )
    await page.pause()
  })

  test('session 1 — load config, connect, and read', async () => {
    test.setTimeout(30_000)

    await loadClientConfig(page, CLIENT_CONFIG)
    await enableAdvancedMode(page)
    await connectAndRead()
    await verifyPhaseCurrents()
  })

  test('session 1 — close app', async () => {
    await closeApp()
  })

  // ─── Session 2: Reopen and verify reconnect works ─────────────

  test('session 2 — reopen app (persisted state)', async () => {
    await launchApp(false)

    // Navigate to client
    await page.getByTestId('home-client-btn').click()
    await expect(page.getByTestId('protocol-rtu-btn')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('protocol-rtu-btn')).toHaveClass(/Mui-selected/)
  })

  test('session 2 — connect and read', async () => {
    test.setTimeout(30_000)
    await connectAndRead()
    await verifyPhaseCurrents()
  })

  test('session 2 — close app', async () => {
    await closeApp()
  })

  // ─── Session 3: Second reopen — same scenario ─────────────────

  test('session 3 — reopen app (persisted state)', async () => {
    await launchApp(false)

    await page.getByTestId('home-client-btn').click()
    await expect(page.getByTestId('protocol-rtu-btn')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('protocol-rtu-btn')).toHaveClass(/Mui-selected/)
  })

  test('session 3 — connect and read', async () => {
    test.setTimeout(30_000)
    await connectAndRead()
    await verifyPhaseCurrents()
  })

  test('session 3 — disconnect and switch to TCP', async () => {
    // Disable read-config
    await disableReadConfiguration(page)

    // Disconnect
    await page.getByTestId('connect-btn').click()
    await expect(page.getByTestId('connect-btn')).toContainText('Connect', { timeout: 5000 })

    // Switch back to TCP
    await page.getByTestId('protocol-tcp-btn').click()
    await expect(page.getByTestId('tcp-host-input')).toBeVisible()
  })
})
