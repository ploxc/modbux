import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToServer,
  navigateToClient,
  selectDataType,
  addRegister
} from '../../fixtures/helpers'
import type { RegisterDef } from '../../fixtures/types'

test.describe.serial('Input validation — AddRegister modal and client inputs', () => {
  test('navigate to server view', async ({ mainPage }) => {
    await navigateToServer(mainPage)
  })

  // ─── AddRegister modal input validation ─────────────────────────────

  test('open holding_registers add modal — verify default state', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)

    // Default mode is Fixed
    await expect(mainPage.getByTestId('add-reg-fixed-btn')).toHaveClass(/Mui-selected/)
    // Default type is INT16
    const typeSelect = mainPage.getByTestId('add-reg-type-select')
    await expect(typeSelect).toContainText('INT16')
    // Address input should be visible
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()
    // Value input should be visible (fixed mode)
    await expect(mainPage.getByTestId('add-reg-value-input')).toBeVisible()
  })

  test('address input: value > 65535 gets clamped', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('99999')
    await mainPage.waitForTimeout(200)
    const val = await addressInput.inputValue()
    expect(Number(val)).toBe(65535)
  })

  test('address max changes per data type: INT32 max=65534, INT64 max=65532', async ({
    mainPage
  }) => {
    // Select INT32 (2 registers)
    await selectDataType(mainPage, 'INT32')
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('65535')
    await mainPage.waitForTimeout(200)
    const val32 = await addressInput.inputValue()
    expect(Number(val32)).toBe(65534)

    // Select INT64 (4 registers)
    await selectDataType(mainPage, 'INT64')
    await addressInput.fill('65535')
    await mainPage.waitForTimeout(200)
    const val64 = await addressInput.inputValue()
    expect(Number(val64)).toBe(65532)

    // Reset to INT16 for next tests
    await selectDataType(mainPage, 'INT16')
  })

  test('address "In use" error: add register at 0, then try duplicate', async ({ mainPage }) => {
    // Close current modal first
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)

    // Add a register at address 0
    const reg: RegisterDef = {
      registerType: 'holding_registers',
      address: 0,
      dataType: 'INT16',
      mode: 'fixed',
      value: '100',
      comment: 'validation test'
    }
    await addRegister(mainPage, reg)

    // Open modal again and try address 0
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await mainPage.waitForTimeout(300)
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('0')
    await mainPage.waitForTimeout(300)

    // Submit button should be disabled or address should show error
    const submitBtn = mainPage.getByTestId('add-reg-submit-btn')
    await expect(submitBtn).toBeDisabled()
  })

  test('address fit error: INT32 at address 65535 does not fit', async ({ mainPage }) => {
    await selectDataType(mainPage, 'INT32')
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('65535')
    await mainPage.waitForTimeout(300)

    // !changed: the imask input field corrects the value automatically
    const val32 = await addressInput.inputValue()
    expect(Number(val32)).toBe(65534)
    // const submitBtn = mainPage.getByTestId('add-reg-submit-btn')
    // await expect(submitBtn).toBeDisabled()
  })

  test('value input clamped: INT16 value 50000 clamped to 32767', async ({ mainPage }) => {
    await selectDataType(mainPage, 'INT16')
    const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
    await addressInput.fill('10')
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('add-reg-fixed-btn').click()
    await mainPage.waitForTimeout(200)

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('50000')
    await mainPage.waitForTimeout(200)
    const val = await valueInput.inputValue()
    expect(Number(val)).toBe(32767)
  })

  test('value input for UINT16: 70000 clamped to 65535', async ({ mainPage }) => {
    await selectDataType(mainPage, 'UINT16')
    await mainPage.waitForTimeout(200)

    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await valueInput.fill('70000')
    await mainPage.waitForTimeout(200)
    const val = await valueInput.inputValue()
    expect(Number(val)).toBe(65535)
  })

  test('UTF-8 specific fields: string and length inputs appear, generator hidden', async ({
    mainPage
  }) => {
    await selectDataType(mainPage, 'UTF-8')
    await mainPage.waitForTimeout(300)

    // String input should be visible
    await expect(mainPage.getByTestId('add-reg-string-input')).toBeVisible()
    // Length input should be visible
    await expect(mainPage.getByTestId('add-reg-length-input')).toBeVisible()
    // Generator toggle should be hidden
    await expect(mainPage.getByTestId('add-reg-generator-btn')).not.toBeVisible()
  })

  test('UTF-8 register length range: 1-124', async ({ mainPage }) => {
    const lengthInput = mainPage.getByTestId('add-reg-length-input').locator('input')

    // Try a large value
    await lengthInput.fill('200')
    await mainPage.waitForTimeout(200)
    const val = await lengthInput.inputValue()
    expect(Number(val)).toBe(124)

    // Close modal
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // !delete: this is not an issue, the app randomises between the two values, even if max is
  // !        smaller than min
  // test('min/max validation: min > max disables submit', async ({ mainPage }) => {
  //   // Switch to a numeric type with generator mode
  //   await selectDataType(mainPage, 'INT16')
  //   await mainPage.waitForTimeout(200)

  //   // Use a free address
  //   const addressInput = mainPage.getByTestId('add-reg-address-input').locator('input')
  //   await addressInput.fill('20')
  //   await mainPage.waitForTimeout(200)

  //   await mainPage.getByTestId('add-reg-generator-btn').click()
  //   await mainPage.waitForTimeout(200)

  //   const minInput = mainPage.getByTestId('add-reg-min-input').locator('input')
  //   const maxInput = mainPage.getByTestId('add-reg-max-input').locator('input')

  //   await minInput.fill('500')
  //   await maxInput.fill('100')
  //   await mainPage.waitForTimeout(300)

  //   const submitBtn = mainPage.getByTestId('add-reg-submit-btn')
  //   await expect(submitBtn).toBeDisabled()

  //   // Close modal
  //   await mainPage.keyboard.press('Escape')
  //   await mainPage.waitForTimeout(300)
  // })

  // ─── Client connection input validation ──────────────────────────────

  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('IP address mask: segments clamped to 255', async ({ mainPage }) => {
    const hostInput = mainPage.getByTestId('tcp-host-input').locator('input')
    await hostInput.fill('999.999.999.999')
    await mainPage.waitForTimeout(300)

    // !changed: a seperator is automatically added when an segment is larger than 255
    const val = await hostInput.inputValue()
    expect(val).toBe('99.9.99.99')

    // // Each segment should be clamped to 255
    // const segments = val.split('.')
    // for (const seg of segments) {
    //   expect(Number(seg)).toBe(255)
    // }
  })

  test('port input: clamped to 65535', async ({ mainPage }) => {
    const portInput = mainPage.getByTestId('tcp-port-input').locator('input')
    await portInput.fill('99999')
    await mainPage.waitForTimeout(300)
    const val = await portInput.inputValue()
    expect(Number(val)).toBe(65535)
  })

  test('unit ID input: clamped to 255', async ({ mainPage }) => {
    const unitIdInput = mainPage.getByTestId('client-unitid-input').locator('input')
    await unitIdInput.fill('999')
    await mainPage.waitForTimeout(300)
    const val = await unitIdInput.inputValue()
    expect(Number(val)).toBe(255)
  })
})
