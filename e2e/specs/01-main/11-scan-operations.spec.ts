import { test, expect } from '../../fixtures/electron-app'
import {
  setupServerConfig,
  navigateToClient,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  cleanServerState
} from '../../fixtures/helpers'
import { SERVER_1_UNIT_0, SERVER_1_UNIT_1 } from '../../fixtures/test-data'

test.describe.serial('Scan Operations', () => {
  // Setup: clean state and configure server with registers on multiple unit IDs
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('setup server with multiple units', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_0, true)
    await setupServerConfig(mainPage, SERVER_1_UNIT_1, true)
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  // Register Scan
  test('open register scan dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await mainPage.getByTestId('scan-registers-btn').click()
    await mainPage.waitForTimeout(500)
  })

  test('configure and start register scan', async ({ mainPage }) => {
    // Set scan parameters
    const minAddr = mainPage.getByTestId('scan-min-address-input').locator('input')
    await minAddr.fill('0')
    const maxAddr = mainPage.getByTestId('scan-max-address-input').locator('input')
    await maxAddr.fill('25')
    const length = mainPage.getByTestId('scan-length-input').locator('input')
    await length.fill('1')
    const timeout = mainPage.getByTestId('scan-timeout-input').locator('input')
    await timeout.fill('500')

    // Start scanning — modal closes automatically when scan completes
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-start-stop-btn')).not.toBeVisible({
      timeout: 30000
    })
  })

  test('verify register scan found registers', async ({ mainPage }) => {
    // Modal auto-closed, results are in the main DataGrid
    const rows = mainPage.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const count = await rows.count()
    expect(count).toBeGreaterThan(0)
  })

  // Unit ID Scan
  test('open unit ID scan dialog', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await mainPage.getByTestId('scan-unitids-btn').click()
    await mainPage.waitForTimeout(500)
  })

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

    // Start scanning — wait for button to return to "Start Scanning"
    await mainPage.getByTestId('scan-unitid-start-stop-btn').click()
    await expect(mainPage.getByTestId('scan-unitid-start-stop-btn')).toContainText(
      'Start Scanning',
      { timeout: 30000 }
    )
  })

  test('verify unit ID scan found configured units', async ({ mainPage }) => {
    // Scope to the modal's DataGrid (not the main register grid behind it)
    const modal = mainPage.locator('.MuiModal-root')
    const rows = modal.locator('.MuiDataGrid-row')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
    const count = await rows.count()
    // Unit IDs 0 and 1 are configured, so at least 2 rows
    expect(count).toBeGreaterThanOrEqual(2)

    // Verify rows for unit ID 0 and 1 exist
    const unit0Row = modal.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(unit0Row).toBeVisible()
    const unit1Row = modal.locator('.MuiDataGrid-row[data-id="1"]')
    await expect(unit1Row).toBeVisible()
  })

  test('close unit ID scan dialog', async ({ mainPage }) => {
    // Escape works now that scanning is finished
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('close menu dialog', async ({ mainPage }) => {
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('disconnect', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
