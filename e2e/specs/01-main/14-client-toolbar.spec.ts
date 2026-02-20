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
  loadServerConfig
} from '../../fixtures/helpers'
import { resolve } from 'path'

const SERVER_CONFIG = resolve(__dirname, '../../fixtures/config-files/server-integration.json')

test.describe.serial('Client toolbar — display options and utilities', () => {
  // ─── Setup ──────────────────────────────────────────────────────────

  test('clean and load server config', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
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

    // Ensure raw mode is off before testing toggle
    const classes = await rawBtn.getAttribute('class')
    if (classes?.includes('containedWarning')) {
      await rawBtn.click()
      await mainPage.waitForTimeout(300)
    }

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
    const logBtn = mainPage.getByTestId('show-log-btn')
    const logPanel = mainPage.getByTestId('transaction-log-panel')

    // Click show log
    await logBtn.click()
    await mainPage.waitForTimeout(500)

    await expect(logBtn).toContainText('Hide Log')
    await expect(logPanel).toBeVisible()

    // Click again to hide
    await logBtn.click()
    await mainPage.waitForTimeout(500)
    await expect(logBtn).toContainText('Show Log')
    await expect(logPanel).not.toBeVisible()
  })

  // ─── Register read config toggle ──────────────────────────────────

  test('read config button is disabled when no registers configured', async ({ mainPage }) => {
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await expect(btn).toBeDisabled()
  })

  test('read config button enables after setting a data type', async ({ mainPage }) => {
    // Double-click the data type cell on row 0 to open the select
    const row = mainPage.locator('.MuiDataGrid-row').first()
    const dataTypeCell = row.locator('[data-field="dataType"]')
    await dataTypeCell.dblclick()
    await mainPage.waitForTimeout(300)

    // Select INT16 from the dropdown
    await mainPage.getByRole('option', { name: 'INT16', exact: true }).click()
    await mainPage.keyboard.press('Enter')
    await mainPage.waitForTimeout(300)

    // Button should now be enabled
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await expect(btn).toBeEnabled()
  })

  test('read config button toggles on and off', async ({ mainPage }) => {
    const btn = mainPage.getByTestId('reg-read-config-btn')

    // Toggle on
    await btn.click()
    await mainPage.waitForTimeout(300)
    await expect(btn).toHaveClass(/Mui-selected/)

    // Toggle off
    await btn.click()
    await mainPage.waitForTimeout(300)
    await expect(btn).not.toHaveClass(/Mui-selected/)
  })

  test('read config button disables when data type is removed', async ({ mainPage }) => {
    // First toggle on
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await btn.click()
    await mainPage.waitForTimeout(300)
    await expect(btn).toHaveClass(/Mui-selected/)

    // Remove data type (set back to NONE)
    const row = mainPage.locator('.MuiDataGrid-row').first()
    const dataTypeCell = row.locator('[data-field="dataType"]')
    await dataTypeCell.dblclick()
    await mainPage.waitForTimeout(300)
    await mainPage.getByRole('option', { name: 'NONE' }).click()
    await mainPage.keyboard.press('Enter')
    await mainPage.waitForTimeout(300)

    // Button should be disabled and no longer selected
    await expect(btn).toBeDisabled()
  })

  // ─── Load dummy data ────────────────────────────────────────────────

  test('load dummy data button is disabled when connected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeDisabled()
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('disconnect clears grid and enables dummy data', async ({ mainPage }) => {
    await disconnectClient(mainPage)
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')

    // Grid should be empty after disconnect
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)
  })

  test('load dummy data button is enabled when disconnected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('load dummy data populates register grid', async ({ mainPage }) => {
    // Wait for disconnected state before opening menu
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')

    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.getByTestId('load-dummy-data-btn').click()
    await mainPage.waitForTimeout(500)

    // Verify grid has data
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  // ─── Time settings ──────────────────────────────────────────────────

  test('time settings opens popover', async ({ mainPage }) => {
    await mainPage.getByTestId('time-settings-btn').click()
    await mainPage.waitForTimeout(300)

    const popover = mainPage.getByTestId('time-settings-popover')
    await expect(popover).toBeVisible()

    // Close popover
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
    await expect(popover).not.toBeVisible()
  })
})
