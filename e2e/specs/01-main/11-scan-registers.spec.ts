import { test, expect } from '../../fixtures/electron-app'
import {
  loadServerConfig,
  navigateToClient,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  selectRegisterType,
  cleanServerState,
  clearData
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')

test.describe.serial('Scan Registers', () => {
  // ─── Setup ──────────────────────────────────────────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server config', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  // ─── Dialog open/close ──────────────────────────────────────────────

  test('scan registers button is visible in menu', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toBeVisible()
    await expect(mainPage.getByTestId('scan-registers-btn')).toBeEnabled()
  })

  test('button text says "Scan Registers" for holding registers', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan Registers')
    await mainPage.keyboard.press('Escape')
  })

  test('button text says "Scan TRUE Bits" for coils', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Coils')
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan TRUE Bits')
    await mainPage.keyboard.press('Escape')
    // Switch back to holding registers for remaining tests
    await selectRegisterType(mainPage, 'Holding Registers')
  })

  test('button text says "Scan TRUE Bits" for discrete inputs', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan TRUE Bits')
    await mainPage.keyboard.press('Escape')
    await selectRegisterType(mainPage, 'Holding Registers')
  })

  test('button text says "Scan Registers" for input registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Input Registers')
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan Registers')
    await mainPage.keyboard.press('Escape')
    await selectRegisterType(mainPage, 'Holding Registers')
  })

  test('open scan registers dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()
    // The dialog opens with form inputs visible
    await expect(mainPage.getByTestId('scan-unitid-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-length-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-chunk-size-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-timeout-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).toBeVisible()
  })

  // ─── Default values ─────────────────────────────────────────────────

  test('default unit ID matches connection config', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-unitid-input').locator('input')
    await expect(input).toHaveValue('0')
  })

  test('default address is 0', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-address-input').locator('input')
    await expect(input).toHaveValue('0')
  })

  test('default length is 10000', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-length-input').locator('input')
    await expect(input).toHaveValue('10000')
  })

  test('default chunk size is 100', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await expect(input).toHaveValue('100')
  })

  test('default timeout is 500', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-timeout-input').locator('input')
    await expect(input).toHaveValue('500')
  })

  test('start button text is "Start Scanning"', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('scan-start-stop-btn')).toContainText('Start Scanning')
  })

  // ─── Unit ID syncs with main view ──────────────────────────────────

  test('changing unit ID in scan dialog updates main connection config', async ({ mainPage }) => {
    const scanUnitId = mainPage.getByTestId('scan-unitid-input').locator('input')
    await scanUnitId.fill('5')
    await expect(scanUnitId).toHaveValue('5')

    // Close dialog and verify the main toolbar unit ID changed
    await mainPage.keyboard.press('Escape')
    const mainUnitId = mainPage.getByTestId('client-unitid-input').locator('input')
    await expect(mainUnitId).toHaveValue('5')

    // Reset back to 0 via main toolbar
    await mainUnitId.fill('0')
  })

  // ─── Address base toggle ───────────────────────────────────────────

  test('address base toggle switches between 0 and 1', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()

    const addressInput = mainPage.getByTestId('scan-address-input').locator('input')

    // Default base is 0, address displays as 0
    await expect(addressInput).toHaveValue('0')

    // Switch to base 1 — displayed address shifts by +1
    await mainPage.getByTestId('scan-base-1-btn').click()
    await expect(addressInput).toHaveValue('1')

    // Switch back to base 0
    await mainPage.getByTestId('scan-base-0-btn').click()
    await expect(addressInput).toHaveValue('0')
  })

  // ─── Close and reopen ──────────────────────────────────────────────

  test('dialog can be closed with Escape', async ({ mainPage }) => {
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('scan-address-input')).not.toBeVisible()
  })

  // ─── Scan execution: narrow range ──────────────────────────────────

  test('open dialog and configure narrow scan range', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()

    const address = mainPage.getByTestId('scan-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('26')
    const chunkSize = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await chunkSize.fill('1')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')
  })

  test('start scan and wait for completion', async ({ mainPage }) => {
    // Start scanning — modal auto-closes when scan completes
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({
      timeout: 30000
    })
  })

  test('scan found registers in the expected range', async ({ mainPage }) => {
    // Results are in the main DataGrid (modal auto-closed)
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })

    // Server has holding registers at addresses 0,1,2,4,6,8,12,16,20,25 in range 0-25
    // Scan with chunkSize=1 probes each address individually
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(9)
  })

  test('scan results include known addresses', async ({ mainPage }) => {
    // Verify specific known holding register addresses from server config
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="0"]')).toBeVisible()
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="1"]')).toBeVisible()
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="6"]')).toBeVisible()
  })

  // ─── Scan with larger chunk size ────────────────────────────────────

  test('clear data and open dialog for larger-chunk scan', async ({ mainPage }) => {
    await clearData(mainPage)
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()

    const address = mainPage.getByTestId('scan-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('31')
    const chunkSize = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await chunkSize.fill('10')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')
  })

  test('scan with chunkSize=10 completes and shows results', async ({ mainPage }) => {
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({
      timeout: 30000
    })

    // Should have multiple rows (10-register chunks covering 0-30)
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  // ─── Scan coils (TRUE Bits) ────────────────────────────────────────

  test('scan coils finds TRUE bits', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Coils')

    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan TRUE Bits')
    await mainPage.getByTestId('scan-registers-btn').click()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()

    const address = mainPage.getByTestId('scan-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('16')
    const chunkSize = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await chunkSize.fill('1')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')

    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({
      timeout: 30000
    })

    // Server config has coil 5 = true, so scan should find at least that
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  // ─── Scan input registers ──────────────────────────────────────────

  test('scan input registers finds configured values', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Input Registers')

    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan Registers')
    await mainPage.getByTestId('scan-registers-btn').click()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()

    const address = mainPage.getByTestId('scan-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('6')
    const chunkSize = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await chunkSize.fill('1')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')

    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({
      timeout: 30000
    })

    // Server has input registers at 0, 1, 3
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  // ─── Fields disabled during scanning + stop mid-scan ─────────────

  test('fields are disabled while scanning and stop works', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')

    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()
    await expect(mainPage.getByTestId('scan-address-input')).toBeVisible()

    // Configure a very large range so scanning takes time
    const address = mainPage.getByTestId('scan-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('65535')
    const chunkSize = mainPage.getByTestId('scan-chunk-size-input').locator('input')
    await chunkSize.fill('1')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')

    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).toContainText('Stop Scanning')

    // While scanning, all config fields should be disabled
    await expect(mainPage.getByTestId('scan-unitid-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-address-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-length-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-chunk-size-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-timeout-input').locator('input')).toBeDisabled()

    // Stop scan — dialog auto-closes when the scan promise resolves after stop
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({ timeout: 10000 })

    // The scan was stopped early — results are in the main DataGrid.
    // Address 0 should have been reached, but the last holding register
    // (address 26, unix timestamp) should NOT have been reached.
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="0"]')).toBeVisible()
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="26"]')).not.toBeVisible()
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('switch back to holding registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
  })

  test('disconnect', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  // ─── Scan button disabled when disconnected ────────────────────────

  test('scan button is disabled when disconnected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-registers-btn')).toBeDisabled()
    await mainPage.keyboard.press('Escape')
  })
})
