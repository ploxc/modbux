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
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  loadServerConfig
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')

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

  test('read registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '40')
  })

  // ─── Advanced mode & 64-bit toggle ────────────────────────────────

  test('disable advanced mode — no value columns visible', async ({ mainPage }) => {
    // Ensure advanced mode is off (earlier specs may have enabled it)
    await mainPage.getByTestId('menu-btn').click()
    await mainPage
      .getByTestId('advanced-mode-checkbox')
      .waitFor({ state: 'visible', timeout: 5000 })

    const advInput = mainPage
      .getByTestId('advanced-mode-checkbox')
      .locator('input[type="checkbox"]')
    if (await advInput.isChecked()) {
      await mainPage.getByTestId('advanced-mode-checkbox').click()
    }

    // 64-bit checkbox should be disabled when advanced mode is off
    const show64Checkbox = mainPage.getByTestId('show-64bit-checkbox')
    await expect(show64Checkbox).toHaveClass(/Mui-disabled/)

    await mainPage.keyboard.press('Escape')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="word_int16"]')).not.toBeVisible()
    await expect(header.locator('[data-field="word_uint16"]')).not.toBeVisible()
    await expect(header.locator('[data-field="word_float"]')).not.toBeVisible()
  })

  test('enabling advanced mode shows value columns', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage
      .getByTestId('advanced-mode-checkbox')
      .waitFor({ state: 'visible', timeout: 5000 })
    await mainPage.getByTestId('advanced-mode-checkbox').click()
    await mainPage.waitForTimeout(200)

    // Ensure 64-bit is off (earlier specs may have left it on)
    const show64Input = mainPage
      .getByTestId('show-64bit-checkbox')
      .locator('input[type="checkbox"]')
    if (await show64Input.isChecked()) {
      await mainPage.getByTestId('show-64bit-checkbox').click()
      await mainPage.waitForTimeout(200)
    }

    await mainPage.keyboard.press('Escape')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="word_int16"]')).toBeVisible()
    await expect(header.locator('[data-field="word_uint16"]')).toBeVisible()
    await expect(header.locator('[data-field="word_int32"]')).toBeVisible()
    await expect(header.locator('[data-field="word_uint32"]')).toBeVisible()
    await expect(header.locator('[data-field="word_float"]')).toBeVisible()

    // 64-bit columns should not be visible (explicitly disabled above)
    await expect(header.locator('[data-field="word_int64"]')).not.toBeVisible()
  })

  test('enabling 64-bit shows int64, uint64, double columns', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('show-64bit-checkbox').waitFor({ state: 'visible', timeout: 5000 })
    await mainPage.getByTestId('show-64bit-checkbox').click()
    await mainPage.waitForTimeout(200)
    await mainPage.keyboard.press('Escape')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="word_int64"]')).toBeVisible()
    await expect(header.locator('[data-field="word_uint64"]')).toBeVisible()
    await expect(header.locator('[data-field="word_double"]')).toBeVisible()
  })

  test('disabling advanced mode hides all value columns', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage
      .getByTestId('advanced-mode-checkbox')
      .waitFor({ state: 'visible', timeout: 5000 })
    await mainPage.getByTestId('advanced-mode-checkbox').click()
    await mainPage.waitForTimeout(200)
    await mainPage.keyboard.press('Escape')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="word_int16"]')).not.toBeVisible()
    await expect(header.locator('[data-field="word_float"]')).not.toBeVisible()
    await expect(header.locator('[data-field="word_int64"]')).not.toBeVisible()
  })

  test('re-enable advanced mode with 64-bit for remaining tests', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
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
    }

    await expect(rawBtn).not.toHaveClass(/containedWarning/)

    // Toggle raw mode on
    await rawBtn.click()
    await expect(rawBtn).toHaveClass(/containedWarning/)

    // Toggle raw mode off
    await rawBtn.click()
    await expect(rawBtn).not.toHaveClass(/containedWarning/)
  })

  // ─── Transaction log ────────────────────────────────────────────────

  test('show log button reveals log panel', async ({ mainPage }) => {
    const logBtn = mainPage.getByTestId('show-log-btn')
    const logPanel = mainPage.getByTestId('transaction-log-panel')

    // Click show log
    await logBtn.click()

    await expect(logBtn).toContainText('Hide Log')
    await expect(logPanel).toBeVisible()

    // Click again to hide
    await logBtn.click()
    await expect(logBtn).toContainText('Show Log')
    await expect(logPanel).not.toBeVisible()
  })

  // ─── Register read config toggle ──────────────────────────────────

  for (const regType of ['Holding Registers', 'Input Registers']) {
    test(`[${regType}] read config: clear config → button disabled`, async ({ mainPage }) => {
      await selectRegisterType(mainPage, regType)
      await mainPage.getByTestId('clear-config-btn').click()

      const btn = mainPage.getByTestId('reg-read-config-btn')
      await expect(btn).toBeDisabled()
    })

    test(`[${regType}] read config: set data type → button enabled`, async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '10')

      const row = mainPage.locator('.MuiDataGrid-row').first()
      await row.locator('[data-field="dataType"]').dblclick()
      await mainPage.waitForTimeout(300)
      await mainPage.getByRole('option', { name: 'INT16', exact: true }).click()
      await mainPage.keyboard.press('Enter')

      await expect(mainPage.getByTestId('reg-read-config-btn')).toBeEnabled()
    })

    test(`[${regType}] read config: toggle on and off`, async ({ mainPage }) => {
      await enableReadConfiguration(mainPage)
      await disableReadConfiguration(mainPage)
    })

    test(`[${regType}] read config: remove data type → button disabled`, async ({ mainPage }) => {
      await enableReadConfiguration(mainPage)
      const btn = mainPage.getByTestId('reg-read-config-btn')

      const row = mainPage.locator('.MuiDataGrid-row').first()
      await row.locator('[data-field="dataType"]').dblclick()
      await mainPage.waitForTimeout(300)
      await mainPage.getByRole('option', { name: 'NONE' }).click()
      await mainPage.keyboard.press('Enter')

      await expect(btn).toBeDisabled()
    })
  }

  // ─── Coils & Discrete Inputs — toolbar differences ─────────────────

  for (const regType of ['Coils', 'Discrete Inputs']) {
    test(`[${regType}] no endian toggle visible`, async ({ mainPage }) => {
      await selectRegisterType(mainPage, regType)

      await expect(mainPage.getByTestId('endian-be-btn')).not.toBeVisible()
      await expect(mainPage.getByTestId('endian-le-btn')).not.toBeVisible()
    })

    test(`[${regType}] no advanced mode or 64-bit options in menu`, async ({ mainPage }) => {
      await mainPage.getByTestId('menu-btn').click()

      await expect(mainPage.getByTestId('advanced-mode-checkbox')).not.toBeVisible()
      await expect(mainPage.getByTestId('show-64bit-checkbox')).not.toBeVisible()

      await mainPage.keyboard.press('Escape')
    })

    test(`[${regType}] scan button says "Scan TRUE Bits"`, async ({ mainPage }) => {
      await mainPage.getByTestId('menu-btn').click()

      await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan TRUE Bits')

      await mainPage.keyboard.press('Escape')
    })

    test(`[${regType}] grid shows bit column, no dataType column`, async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '8')

      const header = mainPage.locator('.MuiDataGrid-columnHeaders')
      await expect(header.locator('[data-field="bit"]')).toBeVisible()
      await expect(header.locator('[data-field="dataType"]')).not.toBeVisible()
      await expect(header.locator('[data-field="hex"]')).not.toBeVisible()
    })
  }

  test('[Coils] write action column is visible', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="actions"]')).toBeVisible()
  })

  test('[Discrete Inputs] no write action column (read-only)', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await readRegisters(mainPage, '0', '8')

    const header = mainPage.locator('.MuiDataGrid-columnHeaders')
    await expect(header.locator('[data-field="actions"]')).not.toBeVisible()
  })

  // Verify 16-bit register features are back after switching
  test('[Holding Registers] endian toggle and advanced mode return', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')

    await expect(mainPage.getByTestId('endian-be-btn')).toBeVisible()

    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('advanced-mode-checkbox')).toBeVisible()
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan Registers')
    await mainPage.keyboard.press('Escape')
  })

  // ─── Load dummy data ────────────────────────────────────────────────

  test('load dummy data button is disabled when connected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeDisabled()
    await mainPage.keyboard.press('Escape')
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
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.keyboard.press('Escape')
  })

  test('load dummy data populates register grid', async ({ mainPage }) => {
    // Wait for disconnected state before opening menu
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')

    await mainPage.getByTestId('menu-btn').click()
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

    const popover = mainPage.getByTestId('time-settings-popover')
    await expect(popover).toBeVisible()

    // Close popover
    await mainPage.keyboard.press('Escape')
    await expect(popover).not.toBeVisible()
  })
})
