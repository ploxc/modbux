import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  selectRegisterType
} from '../../fixtures/helpers'

test.describe.serial('Scan Unit IDs', () => {
  // ─── Setup (server already configured from spec 11) ─────────────────

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  // ─── Button visibility ─────────────────────────────────────────────

  test('scan unit IDs button is visible and enabled in menu', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-unitids-btn')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitids-btn')).toBeEnabled()
    await mainPage.keyboard.press('Escape')
  })

  // ─── Open dialog and verify defaults ────────────────────────────────

  test('open scan unit IDs dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-unitids-btn').click()

    // All form inputs should be visible
    await expect(mainPage.getByTestId('scan-start-unitid-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-count-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-address-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-length-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-timeout-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toBeVisible()
  })

  test('default start unit ID is 0', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-start-unitid-input').locator('input')
    await expect(input).toHaveValue('0')
  })

  test('default count is 10', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-unitid-count-input').locator('input')
    await expect(input).toHaveValue('10')
  })

  test('default address is 0', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-unitid-address-input').locator('input')
    await expect(input).toHaveValue('0')
  })

  test('default length is 2', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-unitid-length-input').locator('input')
    await expect(input).toHaveValue('2')
  })

  test('default timeout is 500', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-unitid-timeout-input').locator('input')
    await expect(input).toHaveValue('500')
  })

  test('start button text is "Start Scanning"', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText('Start Scanning')
  })

  // ─── Register type toggle buttons ──────────────────────────────────

  test('Holding Registers is selected by default', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const holdingBtn = modal.locator('button.MuiToggleButton-root', {
      hasText: 'Holding Registers'
    })
    await expect(holdingBtn).toHaveClass(/Mui-selected/)
  })

  test('Coils, Discrete Inputs, and Input Registers are not selected by default', async ({
    mainPage
  }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const coilsBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Coils' })
    const diBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Discrete Inputs' })
    const irBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Input Registers' })

    await expect(coilsBtn).not.toHaveClass(/Mui-selected/)
    await expect(diBtn).not.toHaveClass(/Mui-selected/)
    await expect(irBtn).not.toHaveClass(/Mui-selected/)
  })

  test('can select multiple register types', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const coilsBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Coils' })

    await coilsBtn.click()
    await expect(coilsBtn).toHaveClass(/Mui-selected/)

    // Holding should still be selected (multi-select)
    const holdingBtn = modal.locator('button.MuiToggleButton-root', {
      hasText: 'Holding Registers'
    })
    await expect(holdingBtn).toHaveClass(/Mui-selected/)

    // Deselect coils again for clean state
    await coilsBtn.click()
    await expect(coilsBtn).not.toHaveClass(/Mui-selected/)
  })

  test('start button is disabled when no register types selected', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const holdingBtn = modal.locator('button.MuiToggleButton-root', {
      hasText: 'Holding Registers'
    })

    // Deselect the only selected type
    await holdingBtn.click()
    await expect(holdingBtn).not.toHaveClass(/Mui-selected/)

    // Start button should be disabled
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toBeDisabled()

    // Re-select holding registers
    await holdingBtn.click()
    await expect(holdingBtn).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toBeEnabled()
  })

  // ─── Scan execution: holding registers only ─────────────────────────

  test('configure and start unit ID scan', async ({ mainPage }) => {
    const startUnit = mainPage.getByTestId('scan-start-unitid-input').locator('input')
    await startUnit.fill('0')
    const count = mainPage.getByTestId('scan-unitid-count-input').locator('input')
    await count.fill('6')
    const address = mainPage.getByTestId('scan-unitid-address-input').locator('input')
    await address.fill('0')
    const length = mainPage.getByTestId('scan-unitid-length-input').locator('input')
    await length.fill('1')
    const timeout = mainPage.getByTestId('scan-unitid-timeout-input').locator('input')
    await timeout.fill('500')

    // Start scanning — button text changes back when done
    await mainPage.getByTestId('scan-unitid-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText(
      'Start Scanning',
      { timeout: 30000 }
    )
  })

  test('scan results grid shows responding unit IDs', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const rows = modal.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })

    // At least unit 0 and unit 1 should respond (they have holding registers)
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('unit ID 0 row exists in results', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    await expect(modal.locator('.MuiDataGrid-row[data-id="0"]')).toBeVisible()
  })

  test('unit ID 1 row exists in results', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    await expect(modal.locator('.MuiDataGrid-row[data-id="1"]')).toBeVisible()
  })

  test('results show OK chip for responding unit IDs', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    // Unit 0 has holding registers — should show OK chip
    const row0 = modal.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row0.locator('.MuiChip-colorSuccess')).toBeVisible()
  })

  // ─── Scan with multiple register types ──────────────────────────────

  test('select all four register types and re-scan', async ({ mainPage }) => {
    test.setTimeout(60000)

    const modal = mainPage.locator('.MuiModal-root')
    const coilsBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Coils' })
    const diBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Discrete Inputs' })
    const irBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Input Registers' })

    await coilsBtn.click()
    await diBtn.click()
    await irBtn.click()

    // All four should now be selected
    await expect(coilsBtn).toHaveClass(/Mui-selected/)
    await expect(diBtn).toHaveClass(/Mui-selected/)
    await expect(irBtn).toHaveClass(/Mui-selected/)

    const count = mainPage.getByTestId('scan-unitid-count-input').locator('input')
    await count.fill('4')
    const timeout = mainPage.getByTestId('scan-unitid-timeout-input').locator('input')
    await timeout.fill('500')

    // Start scan
    await mainPage.getByTestId('scan-unitid-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText(
      'Start Scanning',
      { timeout: 60000 }
    )
  })

  test('multi-type scan results show columns for each type', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')

    // Grid headers should include all four register types
    const headers = modal.locator('.MuiDataGrid-columnHeader')
    const headerTexts = await headers.allTextContents()
    const headerText = headerTexts.join(' ')

    expect(headerText).toContain('Coils')
    expect(headerText).toContain('Inputs')
    expect(headerText).toContain('Input Reg.')
    expect(headerText).toContain('Holding')
  })

  test('unit 0 shows OK for all four types', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const row0 = modal.locator('.MuiDataGrid-row[data-id="0"]')

    // Unit 0 has coils, discrete inputs, holding registers and input registers
    const okChips = row0.locator('.MuiChip-colorSuccess')
    const count = await okChips.count()
    expect(count).toBe(4)
  })

  test('unit 1 shows OK for holding, input, and coils', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const row1 = modal.locator('.MuiDataGrid-row[data-id="1"]')

    // Unit 1 has holding registers, input registers, and coils
    const okChips = row1.locator('.MuiChip-colorSuccess')
    const count = await okChips.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  // ─── Fields disabled during scanning + stop mid-scan ─────────────

  test('fields are disabled while scanning and stop works', async ({ mainPage }) => {
    // Configure max range so scanning takes time
    const startUnit = mainPage.getByTestId('scan-start-unitid-input').locator('input')
    await startUnit.fill('0')
    const count = mainPage.getByTestId('scan-unitid-count-input').locator('input')
    await count.fill('256')
    const timeout = mainPage.getByTestId('scan-unitid-timeout-input').locator('input')
    await timeout.fill('500')

    await mainPage.getByTestId('scan-unitid-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText('Stop Scanning')

    // While scanning, all config fields should be disabled
    await expect(mainPage.getByTestId('scan-start-unitid-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-unitid-count-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-unitid-address-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-unitid-length-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('scan-unitid-timeout-input').locator('input')).toBeDisabled()

    // Stop scan mid-operation
    await mainPage.getByTestId('scan-unitid-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText(
      'Start Scanning',
      { timeout: 10000 }
    )

    // Fields should be re-enabled after stopping
    await expect(mainPage.getByTestId('scan-start-unitid-input').locator('input')).toBeEnabled()
    await expect(mainPage.getByTestId('scan-unitid-count-input').locator('input')).toBeEnabled()
  })

  // ─── Address base toggle ──────────────────────────────────────────

  test('address base toggle on address field switches between 0 and 1', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('scan-unitid-address-input').locator('input')

    // Default base is 0, address displays as 0
    await expect(addressInput).toHaveValue('0')

    // Switch to base 1
    await mainPage.getByTestId('scan-unitid-base-1-btn').click()
    await expect(addressInput).toHaveValue('1')

    // Switch back to base 0
    await mainPage.getByTestId('scan-unitid-base-0-btn').click()
    await expect(addressInput).toHaveValue('0')
  })

  // ─── Close dialog ──────────────────────────────────────────────────

  test('close unit ID scan dialog', async ({ mainPage }) => {
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('scan-start-unitid-input')).not.toBeVisible()
  })

  test('close menu dialog', async ({ mainPage }) => {
    await mainPage.keyboard.press('Escape')
  })

  // ─── Disconnect and disabled state ─────────────────────────────────

  test('disconnect', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('scan unit IDs button is disabled when disconnected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('scan-unitids-btn')).toBeDisabled()
    await mainPage.keyboard.press('Escape')
  })

  // ─── Restore register type ─────────────────────────────────────────

  test('switch back to holding registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
  })
})
