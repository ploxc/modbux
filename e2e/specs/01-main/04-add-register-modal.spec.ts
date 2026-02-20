import { test, expect } from '../../fixtures/electron-app'
import { navigateToServer, selectDataType, selectUnitId, addRegister } from '../../fixtures/helpers'
import type { RegisterDef } from '../../fixtures/types'

test.describe.serial('AddRegister modal — state management and validation', () => {
  test('navigate to server, select server 502, unit 0', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await mainPage.getByTestId('select-server-502').click()
    await mainPage.waitForTimeout(300)
    await selectUnitId(mainPage, '0')
    await mainPage.waitForTimeout(300)
  })

  // ─── Modal state management ──────────────────────────────────────────

  test('open modal — verify defaults (Fixed selected, INT16)', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await expect(mainPage.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = mainPage.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    // Verify all default fields visible
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-value-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-comment-input')).toBeVisible()

    // Buttons: Add & Close + Add & Next
    await expect(mainPage.getByTestId('add-reg-submit-btn')).toContainText('Add & Close')
    await expect(mainPage.getByTestId('add-reg-next-btn')).toBeVisible()
    // Remove button should NOT be visible in add mode
    await expect(mainPage.getByTestId('add-reg-remove-btn')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('open modal, change to Generator + FLOAT, close with Escape', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await mainPage.getByTestId('add-reg-generator-btn').click()
    await selectDataType(mainPage, 'FLOAT')
    await mainPage.waitForTimeout(200)

    // Generator fields visible
    await expect(mainPage.getByTestId('add-reg-min-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-max-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-interval-input')).toBeVisible()
    // Value input hidden in generator mode
    await expect(mainPage.getByTestId('add-reg-value-input')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('reopen modal — verify state reset to defaults (Fixed, INT16)', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await expect(mainPage.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = mainPage.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Add & Next chaining ──────────────────────────────────────────────

  test('Add & Next: address advances, mode/type preserved, comment reset', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    // Configure: address 100, UINT32, Generator, min 50, max 200, interval 5, comment "first"
    await selectDataType(mainPage, 'UINT32')
    await mainPage.getByTestId('add-reg-generator-btn').click()

    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('100')
    const minInput = mainPage.getByTestId('add-reg-min-input').locator('input')
    await minInput.fill('50')
    const maxInput = mainPage.getByTestId('add-reg-max-input').locator('input')
    await maxInput.fill('200')
    const intervalInput = mainPage.getByTestId('add-reg-interval-input').locator('input')
    await intervalInput.fill('5')
    const commentInput = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput.fill('first')
    await mainPage.waitForTimeout(200)

    // Click "Add & Next"
    await mainPage.getByTestId('add-reg-next-btn').click()
    await mainPage.waitForTimeout(300)

    // Modal should still be open
    await expect(mainPage.getByTestId('add-reg-submit-btn')).toBeVisible()

    // Address advanced from 100 (UINT32 = 2 regs) to 102
    expect(await addressInput.inputValue()).toBe('102')

    // Generator mode preserved
    await expect(mainPage.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)

    // UINT32 preserved
    const typeSelect = mainPage.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('UINT32')

    // min/max/interval preserved
    expect(await minInput.inputValue()).toBe('50')
    expect(await maxInput.inputValue()).toBe('200')
    expect(await intervalInput.inputValue()).toBe('5')

    // Comment reset to empty
    expect(await commentInput.inputValue()).toBe('')

    // Close modal
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('Add & Next for UTF-8: string reset, address advances by register length', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UTF-8')
    await mainPage.waitForTimeout(200)

    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('200')
    const lengthInput = mainPage.getByTestId('add-reg-length-input').locator('input')
    await lengthInput.fill('5')
    await mainPage.waitForTimeout(100)
    const stringInput = mainPage.getByTestId('add-reg-string-input').locator('input')
    await stringInput.fill('Test')
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('add-reg-next-btn').click()
    await mainPage.waitForTimeout(300)

    // Address advanced from 200 by 5 registers to 205
    expect(await addressInput.inputValue()).toBe('205')
    // UTF-8 type preserved
    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('UTF-8')
    // Register length preserved
    expect(await lengthInput.inputValue()).toBe('5')
    // String value reset
    expect(await stringInput.inputValue()).toBe('')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('switch to input_registers — verify modal reset between register types', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('add-input_registers-btn').click()
    await mainPage.waitForTimeout(300)

    // Should be back to defaults
    await expect(mainPage.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    const typeSelect = mainPage.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Edit mode ────────────────────────────────────────────────────────

  test('edit mode: shows Submit Change + Remove, no Add & Next', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-100').click()
    await mainPage.waitForTimeout(300)

    // Edit mode buttons
    await expect(mainPage.getByTestId('add-reg-submit-btn')).toContainText('Submit Change')
    await expect(mainPage.getByTestId('add-reg-remove-btn')).toBeVisible()
    // Add & Next should NOT be visible in edit mode
    await expect(mainPage.getByTestId('add-reg-next-btn')).not.toBeVisible()

    // Verify loaded values
    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('UINT32')
    await expect(mainPage.getByTestId('add-reg-generator-btn')).toHaveClass(/Mui-selected/)
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    expect(await addressInput.inputValue()).toBe('100')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('remove test registers via edit modal', async ({ mainPage }) => {
    // Remove register at 100
    await mainPage.getByTestId('server-edit-reg-holding_registers-100').click()
    await mainPage.waitForTimeout(500)
    await mainPage.getByTestId('add-reg-remove-btn').click()
    await mainPage.waitForTimeout(500)

    // Remove UTF-8 register at 200
    await mainPage.getByTestId('server-edit-reg-holding_registers-200').click()
    await mainPage.waitForTimeout(500)
    await mainPage.getByTestId('add-reg-remove-btn').click()
    await mainPage.waitForTimeout(500)
  })

  // ─── Per data type field visibility ──────────────────────────────────

  test('INT16 fixed: value input visible, string/datetime hidden', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'INT16')
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-value-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-string-input')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-reg-datetime-input')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('UTF-8: string/length visible, generator toggle hidden', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UTF-8')
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-string-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-length-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-generator-btn')).not.toBeVisible()
    // Value input hidden for UTF-8
    await expect(mainPage.getByTestId('add-reg-value-input')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('UNIX fixed: datetime picker visible, value input hidden', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UNIX')
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('add-reg-fixed-btn').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-datetime-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-datetime-show-utc')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-value-input')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('UNIX generator: interval visible, datetime/min/max hidden', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UNIX')
    await mainPage.waitForTimeout(200)
    await mainPage.getByTestId('add-reg-generator-btn').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-interval-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-datetime-input')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-reg-min-input')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-reg-max-input')).not.toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('DATETIME fixed: datetime picker visible', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'DATETIME')
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('add-reg-fixed-btn').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-datetime-input')).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Validation tests ─────────────────────────────────────────────────

  test('address duplicate detection: add at 50, try duplicate', async ({ mainPage }) => {
    // Add register at address 50
    const reg: RegisterDef = {
      registerType: 'holding_registers',
      address: 50,
      dataType: 'INT16',
      mode: 'fixed',
      value: '123'
    }
    await addRegister(mainPage, reg)

    // Try to add another at address 50
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('50')
    await mainPage.waitForTimeout(300)

    // Submit should be disabled
    await expect(mainPage.getByTestId('add-reg-submit-btn')).toBeDisabled()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)

    // Clean up: remove register at 50
    await mainPage.getByTestId('server-edit-reg-holding_registers-50').click()
    await mainPage.waitForTimeout(500)
    await mainPage.getByTestId('add-reg-remove-btn').click()
    await mainPage.waitForTimeout(500)
  })

  test('address fit: DOUBLE at 65534 gets auto-corrected to 65532', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'DOUBLE')
    await mainPage.waitForTimeout(200)

    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('65534')
    await mainPage.waitForTimeout(300)

    // IMask auto-corrects the value
    const val = await addressInput.inputValue()
    expect(Number(val)).toBe(65532)

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('value clamping: UINT16 fixed, enter 99999 clamped to 65535', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UINT16')
    await mainPage.getByTestId('add-reg-fixed-btn').click()
    await mainPage.waitForTimeout(200)

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('99999')
    await mainPage.waitForTimeout(200)
    const val = await valueInput.inputValue()
    expect(Number(val)).toBe(65535)

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('submit disabled when address is empty', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('')
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-submit-btn')).toBeDisabled()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })
})
