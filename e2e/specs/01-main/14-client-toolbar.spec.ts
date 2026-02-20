/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  readRegisters,
  cell,
  selectRegisterType,
  enableAdvancedMode,
  cleanServerState,
  setupServerConfig,
  clearData
} from '../../fixtures/helpers'
import { SERVER_1_UNIT_0 } from '../../fixtures/test-data'

test.describe.serial('Client toolbar — display options and utilities', () => {
  // ─── Setup ──────────────────────────────────────────────────────────

  test('clean and setup server', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await setupServerConfig(mainPage, SERVER_1_UNIT_0, true)
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('enable advanced mode', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  test('read registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '40')
  })

  // ─── Address base ───────────────────────────────────────────────────

  test('address base 0 is selected by default', async ({ mainPage }) => {
    const base0Btn = mainPage.getByTestId('reg-base-0-btn')
    await expect(base0Btn).toHaveClass(/Mui-selected/)

    // First row address should show "0"
    const addr = await cell(mainPage, 0, 'id')
    expect(addr).toBe('0')
  })

  test('address base 1 shifts grid addresses and input by 1', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('reg-address-input').locator('input')

    // Capture address input value with base 0
    const inputBase0 = await addressInput.inputValue()

    await mainPage.getByTestId('reg-base-1-btn').click()
    await mainPage.waitForTimeout(300)

    const base1Btn = mainPage.getByTestId('reg-base-1-btn')
    await expect(base1Btn).toHaveClass(/Mui-selected/)

    // Grid address should now show "1"
    const addr = await cell(mainPage, 0, 'id')
    expect(addr).toBe('1')

    // Address input should also shift by +1
    const inputBase1 = await addressInput.inputValue()
    expect(Number(inputBase1)).toBe(Number(inputBase0) + 1)

    // Reset back to base 0
    await mainPage.getByTestId('reg-base-0-btn').click()
    await mainPage.waitForTimeout(300)

    const addrReset = await cell(mainPage, 0, 'id')
    expect(addrReset).toBe('0')

    const inputReset = await addressInput.inputValue()
    expect(inputReset).toBe(inputBase0)
  })

  // ─── Grid clearing behavior ────────────────────────────────────────

  test('base change does not clear grid', async ({ mainPage }) => {
    // Grid should have data from earlier read
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)

    // Switch to base 1
    await mainPage.getByTestId('reg-base-1-btn').click()
    await mainPage.waitForTimeout(300)

    // Grid should still have data
    const rowCountAfter = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCountAfter).toBe(rowCount)

    // Switch back to base 0
    await mainPage.getByTestId('reg-base-0-btn').click()
    await mainPage.waitForTimeout(300)

    const rowCountReset = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCountReset).toBe(rowCount)
  })

  test('address change clears grid', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('reg-address-input').locator('input')
    await addressInput.fill('100')
    await mainPage.waitForTimeout(300)

    // Grid should be empty after address change
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)

    // Re-read to restore data for subsequent tests
    await addressInput.fill('0')
    await readRegisters(mainPage, '0', '40')
  })

  test('length change clears grid', async ({ mainPage }) => {
    const lengthInput = mainPage.getByTestId('reg-length-input').locator('input')
    await lengthInput.fill('20')
    await mainPage.waitForTimeout(300)

    // Grid should be empty after length change
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)

    // Re-read to restore data for subsequent tests
    await readRegisters(mainPage, '0', '40')
  })

  // ─── Raw display toggle ─────────────────────────────────────────────

  test('raw button toggles raw display mode', async ({ mainPage }) => {
    const rawBtn = mainPage.getByTestId('raw-btn')

    // Raw mode should be off by default
    await expect(rawBtn).not.toHaveClass(/containedWarning/)

    // Toggle raw mode on
    await rawBtn.click()
    await mainPage.waitForTimeout(300)
    await expect(rawBtn).toHaveClass(/containedWarning/)

    // Toggle raw mode off
    await rawBtn.click()
    await mainPage.waitForTimeout(300)
    await expect(rawBtn).not.toHaveClass(/containedWarning/)
  })

  // ─── Transaction log ────────────────────────────────────────────────

  test('show log button reveals log panel', async ({ mainPage }) => {
    // Click show log
    await mainPage.getByTestId('show-log-btn').click()
    await mainPage.waitForTimeout(500)

    // Verify a log panel or container becomes visible
    const logPanel = mainPage
      .locator('[class*="log"], [data-testid*="log-panel"], [data-testid*="transaction-log"]')
      .first()
    await expect(logPanel).toBeVisible({ timeout: 3000 })

    // Click again to hide
    await mainPage.getByTestId('show-log-btn').click()
    await mainPage.waitForTimeout(500)
  })

  // ─── Load dummy data ────────────────────────────────────────────────

  test('load dummy data populates register grid', async ({ mainPage }) => {
    // Clear current data first
    await clearData(mainPage)
    await mainPage.waitForTimeout(300)

    // Open menu and click load dummy data
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await mainPage.getByTestId('load-dummy-data-btn').click()
    await mainPage.waitForTimeout(500)

    // Verify grid has data — first row should have some hex content
    const firstRowHex = await cell(mainPage, 0, 'hex')
    expect(firstRowHex.length).toBeGreaterThan(0)
  })

  // Read real data again for subsequent tests
  test('re-read registers after dummy data', async ({ mainPage }) => {
    await clearData(mainPage)
    await mainPage.waitForTimeout(200)
    await readRegisters(mainPage, '0', '40')
  })

  // ─── Time settings ──────────────────────────────────────────────────

  test('time settings opens dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('time-settings-btn').click()
    await mainPage.waitForTimeout(300)

    // Verify a dialog/popover appeared
    const dialog = mainPage
      .locator('[role="dialog"], [role="presentation"], .MuiPopover-root, .MuiDialog-root')
      .first()
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Close with Escape
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Register read config ──────────────────────────────────────────

  test('register read config opens dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('reg-read-config-btn').click()
    await mainPage.waitForTimeout(300)

    // Verify a dialog appeared
    const dialog = mainPage
      .locator('[role="dialog"], [role="presentation"], .MuiPopover-root, .MuiDialog-root')
      .first()
    await expect(dialog).toBeVisible({ timeout: 3000 })

    // Close with Escape
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Cleanup ────────────────────────────────────────────────────────

  test('disconnect client', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
