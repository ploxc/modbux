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
    await expect(mainPage.getByTestId('scan-min-unitid-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-max-unitid-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-address-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-length-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-timeout-input')).toBeVisible()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toBeVisible()
  })

  test('default min unit ID is 0', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-min-unitid-input').locator('input')
    await expect(input).toHaveValue('0')
  })

  test('default max unit ID is 10', async ({ mainPage }) => {
    const input = mainPage.getByTestId('scan-max-unitid-input').locator('input')
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
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText(
      'Start Scanning'
    )
  })

  // ─── Register type toggle buttons ──────────────────────────────────

  test('Holding Registers is selected by default', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const holdingBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Holding Registers' })
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
    const holdingBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Holding Registers' })
    await expect(holdingBtn).toHaveClass(/Mui-selected/)

    // Deselect coils again for clean state
    await coilsBtn.click()
    await expect(coilsBtn).not.toHaveClass(/Mui-selected/)
  })

  test('start button is disabled when no register types selected', async ({ mainPage }) => {
    const modal = mainPage.locator('.MuiModal-root')
    const holdingBtn = modal.locator('button.MuiToggleButton-root', { hasText: 'Holding Registers' })

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

  // ─── Input validation ──────────────────────────────────────────────

  test('min unit ID cannot exceed max unit ID (autofix)', async ({ mainPage }) => {
    const minInput = mainPage.getByTestId('scan-min-unitid-input').locator('input')
    const maxInput = mainPage.getByTestId('scan-max-unitid-input').locator('input')

    await maxInput.fill('5')
    await minInput.fill('99')
    // IMask autofix clamps min to max
    await expect(minInput).toHaveValue('5')

    // Reset
    await minInput.fill('0')
    await maxInput.fill('10')
  })

  test('setting min above max clamps max to match', async ({ mainPage }) => {
    const minInput = mainPage.getByTestId('scan-min-unitid-input').locator('input')
    const maxInput = mainPage.getByTestId('scan-max-unitid-input').locator('input')

    // First set max to a low value, then set min above it
    await maxInput.fill('3')
    await expect(maxInput).toHaveValue('3')
    await minInput.fill('8')
    // Zustand setter clamps max up to match min
    await expect(maxInput).toHaveValue('8')

    // Reset
    await maxInput.fill('10')
    await minInput.fill('0')
  })

  test('max unit ID is capped at 255', async ({ mainPage }) => {
    const maxInput = mainPage.getByTestId('scan-max-unitid-input').locator('input')
    await maxInput.fill('999')
    await expect(maxInput).toHaveValue('255')

    // Reset
    await maxInput.fill('10')
  })

  // ─── Scan execution: holding registers only ─────────────────────────

  test('configure and start unit ID scan', async ({ mainPage }) => {
    const minUnit = mainPage.getByTestId('scan-min-unitid-input').locator('input')
    await minUnit.fill('0')
    const maxUnit = mainPage.getByTestId('scan-max-unitid-input').locator('input')
    await maxUnit.fill('5')
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

    const maxUnit = mainPage.getByTestId('scan-max-unitid-input').locator('input')
    await maxUnit.fill('3')
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

  // ─── Close dialog ──────────────────────────────────────────────────

  test('close unit ID scan dialog', async ({ mainPage }) => {
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('scan-min-unitid-input')).not.toBeVisible()
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
