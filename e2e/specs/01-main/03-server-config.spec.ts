import { test, expect } from '../../fixtures/electron-app'
import { navigateToServer, setupServerConfig, selectUnitId } from '../../fixtures/helpers'
import { SERVER_1_UNIT_0, SERVER_1_UNIT_1, SERVER_2_UNIT_0 } from '../../fixtures/test-data'

test.describe.serial('Server configuration', () => {
  test('navigate to server view', async ({ mainPage }) => {
    await navigateToServer(mainPage)
  })

  // !added: previous tests added a holding register, clear server first
  test('clear server before start', async ({ mainPage }) => {
    await mainPage.getByTestId('server-clear-btn').click()
    await mainPage.waitForTimeout(500)
  })

  test('default server exists with port 502', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('select-server-502')).toBeVisible()
    const portInput = mainPage.getByTestId('server-port-input').locator('input')
    await expect(portInput).toHaveValue('502')
  })

  test('configure server 1, unit ID 0 with all data types', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_0)
  })

  test('verify register counts after config', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(9)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('edit holding register 0 value from -100 to 999', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-0').click()
    await mainPage.waitForTimeout(300)

    await expect(mainPage.getByTestId('add-reg-submit-btn')).toContainText('Submit Change')

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('999')
    await mainPage.waitForTimeout(100)

    await mainPage.getByTestId('add-reg-submit-btn').click()
    await mainPage.waitForTimeout(300)

    // Count should remain unchanged
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(9)')
  })

  test('configure server 1, unit ID 1', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_1)

    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
  })

  test('switch back to unit ID 0 — verify data preserved', async ({ mainPage }) => {
    await selectUnitId(mainPage, '0')

    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(9)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('section collapse/expand works', async ({ mainPage }) => {
    await mainPage.getByTestId('section-holding_registers').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('server-edit-reg-holding_registers-0')).not.toBeVisible()

    await mainPage.getByTestId('section-holding_registers').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('server-edit-reg-holding_registers-0')).toBeVisible()
  })

  test('verify generator settings via edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-22').click()
    await mainPage.waitForTimeout(300)

    // Verify generator mode is selected
    await expect(mainPage.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)

    // Verify min/max/interval
    const minInput = mainPage.getByTestId('add-reg-min-input').locator('input')
    const maxInput = mainPage.getByTestId('add-reg-max-input').locator('input')
    const intervalInput = mainPage.getByTestId('add-reg-interval-input').locator('input')
    expect(await minInput.inputValue()).toBe('0')
    expect(await maxInput.inputValue()).toBe('1000')
    expect(await intervalInput.inputValue()).toBe('1')

    // Close modal
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('add second server', async ({ mainPage }) => {
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)

    const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
    expect(await toggleButtons.count()).toBe(2)
  })

  test('second server has different port', async ({ mainPage }) => {
    const portInput = mainPage.getByTestId('server-port-input').locator('input')
    const port = await portInput.inputValue()
    expect(port).not.toBe('502')
  })

  test('configure server 2', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_2_UNIT_0)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
  })

  test('switch to server 1 — verify isolation', async ({ mainPage }) => {
    await mainPage.getByTestId('select-server-502').click()
    await mainPage.waitForTimeout(300)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(9)')
  })
})
