import { test, expect } from '../../fixtures/electron-app'
import { setupServerConfig, selectUnitId, cleanServerState } from '../../fixtures/helpers'
import { SERVER_1_UNIT_0, SERVER_1_UNIT_1, SERVER_2_UNIT_0 } from '../../fixtures/test-data'

test.describe.serial('Cleanup Operations', () => {
  // Setup: clean state first, then create full state to clean up
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('setup servers', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_0, true)
    await setupServerConfig(mainPage, SERVER_1_UNIT_1, true)
    // Add second server
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)
    await setupServerConfig(mainPage, SERVER_2_UNIT_0, true)
  })

  test('clear server 2 register data', async ({ mainPage }) => {
    await mainPage.getByTestId('delete-holding_registers-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(0)')
    await mainPage.getByTestId('delete-coils-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-coils')).toContainText('(0)')
  })

  test('delete server 2', async ({ mainPage }) => {
    await mainPage.getByTestId('delete-server-btn').click()
    await mainPage.waitForTimeout(300)
    const remaining = mainPage.locator('[data-testid^="select-server-"]')
    expect(await remaining.count()).toBe(1)
  })

  test('clear server 1, unit 1 data', async ({ mainPage }) => {
    await mainPage.getByTestId('select-server-502').click()
    await mainPage.waitForTimeout(300)
    await selectUnitId(mainPage, '1')
    await mainPage.getByTestId('delete-holding_registers-btn').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByTestId('delete-input_registers-btn').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByTestId('delete-coils-btn').click()
    await mainPage.waitForTimeout(200)
  })

  test('clear server 1, unit 0 data', async ({ mainPage }) => {
    await selectUnitId(mainPage, '0')
    await mainPage.getByTestId('delete-coils-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-coils')).toContainText('(0)')
    await mainPage.getByTestId('delete-discrete_inputs-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(0)')
    await mainPage.getByTestId('delete-holding_registers-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(0)')
    await mainPage.getByTestId('delete-input_registers-btn').click()
    await mainPage.waitForTimeout(200)
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(0)')
  })

  test('main server cannot be deleted', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('delete-server-btn')).toBeDisabled()
  })
})
