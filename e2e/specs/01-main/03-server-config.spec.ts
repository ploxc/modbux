import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToServer,
  navigateToClient,
  setupServerConfig,
  selectUnitId,
  setServerPanelCollapsed,
  expandAllServerPanels,
  addBool
} from '../../fixtures/helpers'
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

  test('verify server name input exists and is editable', async ({ mainPage }) => {
    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    await nameInput.fill('Test Name')
    await mainPage.waitForTimeout(200)
    expect(await nameInput.inputValue()).toBe('Test Name')
    // Reset for setupServerConfig
    await nameInput.fill('')
  })

  test('configure server 1, unit ID 0 with all data types', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_0)
  })

  test('verify server name after config', async ({ mainPage }) => {
    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    expect(await nameInput.inputValue()).toBe('Integration Test Server')
  })

  test('verify register counts after config', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
  })

  // ─── Edit register value ──────────────────────────────────────────

  test('edit holding register 0 value from -100 to 999', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-0').click()

    await expect(mainPage.getByTestId('add-reg-submit-btn')).toContainText('Submit Change')

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('999')
    await mainPage.waitForTimeout(100)

    await mainPage.getByTestId('add-reg-submit-btn').click()

    // Count should remain unchanged
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
  })

  test('verify edited value persists by reopening edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-0').click()
    await mainPage.waitForTimeout(300)

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    expect(await valueInput.inputValue()).toBe('999')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Verify new data types via edit modal ─────────────────────────

  test('verify UTF-8 register via edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-20').click()

    // Verify data type
    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('UTF-8')
    // Verify string value
    const stringInput = mainPage.getByTestId('add-reg-string-input').locator('input')
    expect(await stringInput.inputValue()).toBe('Hello')
    // Verify register length
    const lengthInput = mainPage.getByTestId('add-reg-length-input').locator('input')
    expect(await lengthInput.inputValue()).toBe('5')
    // Generator toggle should be hidden for UTF-8
    await expect(mainPage.getByTestId('add-reg-generator-btn')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('verify UNIX register via edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-26').click()

    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('UNIX')
    // Fixed mode: date picker should be visible
    await expect(mainPage.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('add-reg-datetime-input')).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('verify DATETIME generator register via edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-28').click()

    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('DATETIME')
    // Generator mode: interval should be visible, no date picker
    await expect(mainPage.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('add-reg-interval-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-datetime-input')).not.toBeVisible()

    const intervalInput = mainPage.getByTestId('add-reg-interval-input').locator('input')
    expect(await intervalInput.inputValue()).toBe('5')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('verify generator settings via edit modal', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-25').click()

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

  // ─── Endianness toggle ────────────────────────────────────────────

  test('default endianness is Big Endian', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-endian-be-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('server-endian-le-btn')).not.toHaveClass(/Mui-selected/)
  })

  test('toggle to Little Endian', async ({ mainPage }) => {
    await mainPage.getByTestId('server-endian-le-btn').click()
    await expect(mainPage.getByTestId('server-endian-le-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('server-endian-be-btn')).not.toHaveClass(/Mui-selected/)
  })

  test('toggle back to Big Endian', async ({ mainPage }) => {
    await mainPage.getByTestId('server-endian-be-btn').click()
    await expect(mainPage.getByTestId('server-endian-be-btn')).toHaveClass(/Mui-selected/)
  })

  // ─── Multi-unit configuration ─────────────────────────────────────

  test('configure server 1, unit ID 1', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_1, true)

    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
  })

  test('switch back to unit ID 0 — verify data preserved', async ({ mainPage }) => {
    await selectUnitId(mainPage, '0')

    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
  })

  // ─── Panel collapse/expand ─────────────────────────────────────────

  test('collapse all four panels hides content', async ({ mainPage }) => {
    await setServerPanelCollapsed(mainPage, 'coils', true)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', true)
    await setServerPanelCollapsed(mainPage, 'holding_registers', true)
    await setServerPanelCollapsed(mainPage, 'input_registers', true)

    // Boolean rows hidden when collapsed
    await expect(mainPage.getByTestId('server-bool-coils-0')).not.toBeVisible()
    await expect(mainPage.getByTestId('server-bool-discrete_inputs-0')).not.toBeVisible()

    // Inline add bar and remove buttons also hidden
    await expect(mainPage.getByTestId('add-bool-inline-coils')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-bool-inline-discrete_inputs')).not.toBeVisible()

    // Register content hidden
    await expect(mainPage.getByTestId('server-edit-reg-holding_registers-0')).not.toBeVisible()
    await expect(mainPage.getByTestId('server-edit-reg-input_registers-0')).not.toBeVisible()

    // Delete buttons hidden for all types
    await expect(mainPage.getByTestId('delete-coils-btn')).not.toBeVisible()
    await expect(mainPage.getByTestId('delete-holding_registers-btn')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-holding_registers-btn')).not.toBeVisible()
  })

  test('section headers still show register counts when collapsed', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
  })

  test('expand all four panels restores content and action buttons', async ({ mainPage }) => {
    await expandAllServerPanels(mainPage)

    // Boolean content visible
    await expect(mainPage.getByTestId('server-bool-coils-0')).toBeVisible()
    await expect(mainPage.getByTestId('server-bool-discrete_inputs-0')).toBeVisible()

    // Inline add bar and remove buttons visible when expanded
    await expect(mainPage.getByTestId('add-bool-inline-coils')).toBeVisible()
    await expect(mainPage.getByTestId('add-bool-inline-discrete_inputs')).toBeVisible()
    await expect(mainPage.getByTestId('remove-bool-coils-0')).toBeAttached()

    // Register content visible
    await expect(mainPage.getByTestId('server-edit-reg-holding_registers-0')).toBeVisible()
    await expect(mainPage.getByTestId('server-edit-reg-input_registers-0')).toBeVisible()

    // Delete buttons visible
    await expect(mainPage.getByTestId('delete-coils-btn')).toBeVisible()
    await expect(mainPage.getByTestId('delete-holding_registers-btn')).toBeVisible()
    await expect(mainPage.getByTestId('add-holding_registers-btn')).toBeVisible()
  })

  test('collapse state persists across navigation', async ({ mainPage }) => {
    // Collapse coils and discrete inputs
    await setServerPanelCollapsed(mainPage, 'coils', true)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', true)

    // Bools hidden when collapsed
    await expect(mainPage.getByTestId('server-bool-coils-0')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-bool-inline-coils')).not.toBeVisible()

    // Navigate to client and back to server
    await navigateToClient(mainPage)
    await navigateToServer(mainPage)

    // Collapsed panels: bools still hidden after navigation
    await expect(mainPage.getByTestId('server-bool-coils-0')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-bool-inline-coils')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-bool-inline-discrete_inputs')).not.toBeVisible()

    // Non-collapsed panels should still be expanded
    await expect(mainPage.getByTestId('server-edit-reg-holding_registers-0')).toBeVisible()
    await expect(mainPage.getByTestId('server-edit-reg-input_registers-0')).toBeVisible()

    // Re-expand for clean state
    await expandAllServerPanels(mainPage)
  })

  // ─── Inline add bar / remove / delete-all for booleans ─────────────

  test('inline add bar: initial address is next free address', async ({ mainPage }) => {
    // Coils currently have addresses 0-15 (16 bools), so next free should be 16
    const addressInput = mainPage.getByTestId('add-bool-address-input-coils').locator('input')
    await expect(addressInput).toHaveValue('16')
  })

  test('inline add bar: add a bool auto-increments to next free address', async ({ mainPage }) => {
    // Add coil at address 16 (current value in input)
    await mainPage.getByTestId('add-bool-btn-coils').click()
    await mainPage.waitForTimeout(100)

    // Verify it was added
    await expect(mainPage.getByTestId('section-coils')).toContainText('(17)')
    await expect(mainPage.getByTestId('server-bool-coils-16')).toBeVisible()

    // Input should auto-increment to 17
    const addressInput = mainPage.getByTestId('add-bool-address-input-coils').locator('input')
    await expect(addressInput).toHaveValue('17')
  })

  test('inline add bar: typed address that is taken snaps to next free', async ({ mainPage }) => {
    // Type an address that is already taken (e.g. 5)
    const addressInput = mainPage.getByTestId('add-bool-address-input-coils').locator('input')
    await addressInput.fill('5')
    await mainPage.getByTestId('add-bool-btn-coils').click()
    await mainPage.waitForTimeout(100)

    // Address 5 is taken, so it snaps to next free which is 17 (since 0-16 exist now)
    await expect(mainPage.getByTestId('section-coils')).toContainText('(18)')
    await expect(mainPage.getByTestId('server-bool-coils-17')).toBeVisible()
  })

  test('inline add bar: add bool via Enter key', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('add-bool-address-input-coils').locator('input')
    // Input should show next free address (18)
    await expect(addressInput).toHaveValue('18')
    await addressInput.press('Enter')
    await mainPage.waitForTimeout(100)

    await expect(mainPage.getByTestId('section-coils')).toContainText('(19)')
    await expect(mainPage.getByTestId('server-bool-coils-18')).toBeVisible()
  })

  test('remove individual bool via remove button', async ({ mainPage }) => {
    // Remove coil at address 18 (just added)
    await mainPage.getByTestId('remove-bool-coils-18').click()
    await mainPage.waitForTimeout(100)

    await expect(mainPage.getByTestId('section-coils')).toContainText('(18)')
    await expect(mainPage.getByTestId('server-bool-row-coils-18')).not.toBeVisible()
  })

  test('remove individual bool: also remove 17 and 16 to restore original count', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('remove-bool-coils-17').click()
    await mainPage.waitForTimeout(100)
    await mainPage.getByTestId('remove-bool-coils-16').click()
    await mainPage.waitForTimeout(100)

    // Back to original 16 coils
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
  })

  test('toggle bool via circle element', async ({ mainPage }) => {
    // Toggle coil 0 on
    const circle = mainPage.getByTestId('server-bool-coils-circle-0')
    await circle.click()
    await mainPage.waitForTimeout(100)

    // Toggle coil 0 off
    await circle.click()
    await mainPage.waitForTimeout(100)

    // No error — toggle is functional
  })

  test('delete all bools resets inline add address to 0', async ({ mainPage }) => {
    // Use discrete_inputs to test delete-all without affecting coils
    // First verify DI has 8 bools
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')

    // Check current input value (should be 8 since addresses 0-7 are taken)
    const addressInput = mainPage
      .getByTestId('add-bool-address-input-discrete_inputs')
      .locator('input')
    await expect(addressInput).toHaveValue('8')

    // Delete all discrete inputs
    await mainPage.getByTestId('delete-discrete_inputs-btn').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(0)')

    // Address input should reset to 0
    await expect(addressInput).toHaveValue('0')
  })

  test('re-add discrete inputs after delete-all', async ({ mainPage }) => {
    // Re-add discrete inputs 0-7 to restore test state
    for (let i = 0; i < 8; i++) {
      await addBool(mainPage, 'discrete_inputs', i, true)
    }
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')

    // Toggle DI 3 on to match original config
    const circle = mainPage.getByTestId('server-bool-discrete_inputs-circle-3')
    await circle.click()
    await mainPage.waitForTimeout(100)
  })

  test('collapsed bool panel: content fully hidden', async ({ mainPage }) => {
    await setServerPanelCollapsed(mainPage, 'coils', true)

    // Bool rows hidden when collapsed
    await expect(mainPage.getByTestId('server-bool-coils-0')).not.toBeVisible()
    await expect(mainPage.getByTestId('server-bool-coils-5')).not.toBeVisible()

    // Inline add bar is hidden
    await expect(mainPage.getByTestId('add-bool-inline-coils')).not.toBeVisible()

    // Re-expand
    await setServerPanelCollapsed(mainPage, 'coils', false)
  })

  // ─── Multi-server configuration ───────────────────────────────────

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
    await setupServerConfig(mainPage, SERVER_2_UNIT_0, true)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
  })

  test('switch to server 1 — verify isolation', async ({ mainPage }) => {
    await mainPage.getByTestId('select-server-502').click()

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
  })

  // ─── Delete server ────────────────────────────────────────────────

  test('switch to server 2 and delete it', async ({ mainPage }) => {
    // Select server 2 (the non-502 one)
    const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
    const count = await toggleButtons.count()
    for (let i = 0; i < count; i++) {
      const testId = await toggleButtons.nth(i).getAttribute('data-testid')
      if (testId !== 'select-server-502') {
        await toggleButtons.nth(i).click()
        await mainPage.waitForTimeout(300)
        break
      }
    }

    await mainPage.getByTestId('delete-server-btn').click()
    await mainPage.waitForTimeout(500)

    // Only server 502 should remain
    const remaining = mainPage.locator('[data-testid^="select-server-"]')
    expect(await remaining.count()).toBe(1)
    await expect(mainPage.getByTestId('select-server-502')).toBeVisible()
  })

  test('server 1 data intact after deleting server 2', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
  })
})
