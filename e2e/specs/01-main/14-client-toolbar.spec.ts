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
    const addr = await cell(mainPage, 0, 'address')
    expect(addr).toBe('0')
  })

  test('address base 1 shifts addresses by 1', async ({ mainPage }) => {
    await mainPage.getByTestId('reg-base-1-btn').click()
    await mainPage.waitForTimeout(300)

    const base1Btn = mainPage.getByTestId('reg-base-1-btn')
    await expect(base1Btn).toHaveClass(/Mui-selected/)

    // First row address should now show "1"
    const addr = await cell(mainPage, 0, 'address')
    expect(addr).toBe('1')

    // Reset back to base 0
    await mainPage.getByTestId('reg-base-0-btn').click()
    await mainPage.waitForTimeout(300)

    const addrReset = await cell(mainPage, 0, 'address')
    expect(addrReset).toBe('0')
  })

  // ─── Raw display toggle ─────────────────────────────────────────────

  test('raw button toggles raw register display', async ({ mainPage }) => {
    // Capture a value before toggling raw mode
    const valueBefore = await cell(mainPage, 0, 'word_int16')
    expect(valueBefore).toBe('-100')

    // Toggle raw mode on
    await mainPage.getByTestId('raw-btn').click()
    await mainPage.waitForTimeout(300)

    // In raw mode, the value column should show raw uint16 (65436 for -100)
    const valueRaw = await cell(mainPage, 0, 'word_int16')
    expect(valueRaw).not.toBe('-100')

    // Toggle raw mode off
    await mainPage.getByTestId('raw-btn').click()
    await mainPage.waitForTimeout(300)

    const valueAfter = await cell(mainPage, 0, 'word_int16')
    expect(valueAfter).toBe('-100')
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
