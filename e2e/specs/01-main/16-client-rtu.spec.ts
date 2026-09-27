/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  selectProtocol,
  expectProtocol,
  serialSelect
} from '../../fixtures/helpers'

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Client RTU — serial protocol configuration', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  // ─── Protocol select ────────────────────────────────────────────────

  test('default protocol is TCP', async ({ mainPage }) => {
    await expectProtocol(mainPage, 'ModbusTcp')

    // TCP fields should be visible
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
  })

  test('switch to RTU hides TCP fields and shows RTU fields', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusRtu')

    // TCP fields should be hidden
    await expect(mainPage.getByTestId('tcp-host-input')).not.toBeVisible()

    // RTU config fields should appear
    await expect(await serialSelect(mainPage, 'baudrate')).toBeVisible()
    await expect(await serialSelect(mainPage, 'parity')).toBeVisible()
    await expect(await serialSelect(mainPage, 'databits')).toBeVisible()
    await expect(await serialSelect(mainPage, 'stopbits')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-com-input')).toBeVisible()

    await expectProtocol(mainPage, 'ModbusRtu')
  })

  test('default RTU values are correct', async ({ mainPage }) => {
    await expect(await serialSelect(mainPage, 'baudrate')).toContainText('9600')
    await expect(await serialSelect(mainPage, 'parity')).toContainText('none')
    await expect(await serialSelect(mainPage, 'databits')).toContainText('8')
    await expect(await serialSelect(mainPage, 'stopbits')).toContainText('1')
  })

  // ─── Serial config fields ──────────────────────────────────────────

  test('baudrate select has expected options', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'baudrate')).click()

    const expectedRates = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200']
    for (const rate of expectedRates) {
      await expect(mainPage.getByRole('option', { name: rate })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
  })

  test('changing baudrate persists selection', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'baudrate')).click()
    await mainPage.getByRole('option', { name: '115200' }).click()

    await expect(await serialSelect(mainPage, 'baudrate')).toContainText('115200')
  })

  // The count is the assertion. A list this select reads from somewhere else
  // passes every visibility check while offering a fourth the binding refuses.
  test('parity select offers the three the serial binding accepts', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'parity')).click()

    const expectedOptions = ['none', 'even', 'odd']
    for (const option of expectedOptions) {
      await expect(mainPage.getByRole('option', { name: option })).toBeVisible()
    }
    await expect(mainPage.getByRole('option')).toHaveCount(expectedOptions.length)

    await mainPage.keyboard.press('Escape')
  })

  test('changing parity persists selection', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'parity')).click()
    await mainPage.getByRole('option', { name: 'even' }).click()

    await expect(await serialSelect(mainPage, 'parity')).toContainText('even')
  })

  test('data bits select has expected options', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'databits')).click()

    const expectedOptions = ['5', '6', '7', '8']
    for (const option of expectedOptions) {
      await expect(mainPage.getByRole('option', { name: option })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
  })

  test('changing data bits persists selection', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'databits')).click()
    await mainPage.getByRole('option', { name: '7' }).click()

    await expect(await serialSelect(mainPage, 'databits')).toContainText('7')
  })

  test('stop bits select has expected options', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'stopbits')).click()

    await expect(mainPage.getByRole('option', { name: '1' })).toBeVisible()
    await expect(mainPage.getByRole('option', { name: '2' })).toBeVisible()

    await mainPage.keyboard.press('Escape')
  })

  test('changing stop bits persists selection', async ({ mainPage }) => {
    await (await serialSelect(mainPage, 'stopbits')).click()
    await mainPage.getByRole('option', { name: '2' }).click()

    await expect(await serialSelect(mainPage, 'stopbits')).toContainText('2')
  })

  // ─── COM port ───────────────────────────────────────────────────────

  test('COM port input accepts text', async ({ mainPage }) => {
    const comInput = mainPage.getByTestId('rtu-com-input').locator('input')
    await comInput.fill('/dev/ttyUSB0')

    await expect(comInput).toHaveValue('/dev/ttyUSB0')
  })

  test('refresh button works without crash', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-refresh-btn').click()

    // Verify the page is still functional
    await expect(await serialSelect(mainPage, 'baudrate')).toBeVisible()
    await expect(mainPage.getByTestId('protocol-select')).toBeVisible()
  })

  test('validate button works without crash', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-validate-btn').click()

    // Verify the page is still functional after validation attempt
    await expect(await serialSelect(mainPage, 'baudrate')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-validate-btn')).toBeVisible()
  })

  // ─── Protocol switching ─────────────────────────────────────────────

  test('switch to TCP hides RTU fields', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusTcp')

    // TCP fields should be visible again
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()

    // RTU fields should be hidden
    await expect(mainPage.getByTestId('rtu-serial-field')).not.toBeVisible()

    // TCP button should be selected
    await expectProtocol(mainPage, 'ModbusTcp')
  })

  test('switching back to RTU preserves changed values', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusRtu')

    // The field sums them up as baud rate and framing
    await expect(mainPage.getByTestId('rtu-serial-field')).toHaveValue('115200 · 7E2')

    // Previously changed values should still be set
    await expect(await serialSelect(mainPage, 'baudrate')).toContainText('115200')
    await expect(await serialSelect(mainPage, 'parity')).toContainText('even')
    await expect(await serialSelect(mainPage, 'databits')).toContainText('7')
    await expect(await serialSelect(mainPage, 'stopbits')).toContainText('2')
  })

  // ─── Cleanup: restore TCP mode ──────────────────────────────────────

  test('switch back to TCP mode for next spec', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusTcp')
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
    await expectProtocol(mainPage, 'ModbusTcp')
  })
})
