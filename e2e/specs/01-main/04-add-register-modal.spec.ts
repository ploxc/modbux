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

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('open modal, change to Generator + FLOAT, close with Escape', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await mainPage.getByTestId('add-reg-generator-btn').click()
    await selectDataType(mainPage, 'FLOAT')
    await mainPage.waitForTimeout(200)

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

  test('remove the test register at holding 100', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-100').click()
    await mainPage.waitForTimeout(500)
    await mainPage.getByTestId('add-reg-remove-btn').click()
    await mainPage.waitForTimeout(1000)
  })

  // ─── Per data type field visibility ──────────────────────────────────

  test('INT16: value input visible, string input not visible', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'INT16')
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-value-input')).toBeVisible()
    await expect(mainPage.getByTestId('add-reg-string-input')).not.toBeVisible()

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

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('UNIX: datetime input visible in fixed mode', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'UNIX')
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('add-reg-fixed-btn').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('add-reg-datetime-input')).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('DATETIME: datetime input visible in fixed mode', async ({ mainPage }) => {
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

  // ─── Additional validation tests ─────────────────────────────────────

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
    await mainPage.waitForTimeout(1000)
  })

  test('address fit: DOUBLE at 65534 shows error', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    await selectDataType(mainPage, 'DOUBLE')
    await mainPage.waitForTimeout(200)

    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('65534')
    await mainPage.waitForTimeout(300)

    // !changed: the imask input field corrects the value automatically
    const val = await addressInput.inputValue()
    expect(Number(val)).toBe(65532)
    //await expect(mainPage.getByTestId('add-reg-submit-btn')).toBeDisabled()

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
})
