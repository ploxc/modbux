/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import { navigateToClient } from '../../fixtures/helpers'

test.describe.serial('Client RTU — serial protocol configuration', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  // ─── Protocol toggle ────────────────────────────────────────────────

  test('default protocol is TCP', async ({ mainPage }) => {
    const tcpBtn = mainPage.getByTestId('protocol-tcp-btn')
    await expect(tcpBtn).toBeVisible()
    await expect(tcpBtn).toHaveClass(/Mui-selected/)

    // TCP fields should be visible
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
  })

  test('switch to RTU hides TCP fields and shows RTU fields', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-rtu-btn').click()
    await mainPage.waitForTimeout(300)

    // TCP fields should be hidden
    await expect(mainPage.getByTestId('tcp-host-input')).not.toBeVisible()

    // RTU config fields should appear
    await expect(mainPage.getByTestId('rtu-baudrate-select')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-parity-select')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-databits-select')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-stopbits-select')).toBeVisible()
    await expect(mainPage.getByTestId('rtu-com-input')).toBeVisible()

    // RTU button should now be selected
    const rtuBtn = mainPage.getByTestId('protocol-rtu-btn')
    await expect(rtuBtn).toHaveClass(/Mui-selected/)
  })

  test('default RTU values are correct', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('rtu-baudrate-select')).toContainText('9600')
    await expect(mainPage.getByTestId('rtu-parity-select')).toContainText('none')
    await expect(mainPage.getByTestId('rtu-databits-select')).toContainText('8')
    await expect(mainPage.getByTestId('rtu-stopbits-select')).toContainText('1')
  })

  // ─── Serial config fields ──────────────────────────────────────────

  test('baudrate select has expected options', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-baudrate-select').click()
    await mainPage.waitForTimeout(200)

    const expectedRates = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200']
    for (const rate of expectedRates) {
      await expect(mainPage.getByRole('option', { name: rate })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('changing baudrate persists selection', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-baudrate-select').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByRole('option', { name: '115200' }).click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('rtu-baudrate-select')).toContainText('115200')
  })

  test('parity select has expected options', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-parity-select').click()
    await mainPage.waitForTimeout(200)

    const expectedOptions = ['none', 'even', 'odd', 'mark', 'space']
    for (const option of expectedOptions) {
      await expect(mainPage.getByRole('option', { name: option })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('changing parity persists selection', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-parity-select').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByRole('option', { name: 'even' }).click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('rtu-parity-select')).toContainText('even')
  })

  test('data bits select has expected options', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-databits-select').click()
    await mainPage.waitForTimeout(200)

    const expectedOptions = ['5', '6', '7', '8']
    for (const option of expectedOptions) {
      await expect(mainPage.getByRole('option', { name: option })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('changing data bits persists selection', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-databits-select').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByRole('option', { name: '7' }).click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('rtu-databits-select')).toContainText('7')
  })

  test('stop bits select has expected options', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-stopbits-select').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByRole('option', { name: '1' })).toBeVisible()
    await expect(mainPage.getByRole('option', { name: '2' })).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('changing stop bits persists selection', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-stopbits-select').click()
    await mainPage.waitForTimeout(200)
    await mainPage.getByRole('option', { name: '2' }).click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByTestId('rtu-stopbits-select')).toContainText('2')
  })

  // ─── COM port ───────────────────────────────────────────────────────

  test('COM port input accepts text', async ({ mainPage }) => {
    const comInput = mainPage.getByTestId('rtu-com-input').locator('input')
    await comInput.fill('/dev/ttyUSB0')
    await mainPage.waitForTimeout(200)

    await expect(comInput).toHaveValue('/dev/ttyUSB0')
  })

  test('refresh button works without crash', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-refresh-btn').click()
    await mainPage.waitForTimeout(500)

    // Verify the page is still functional
    await expect(mainPage.getByTestId('rtu-baudrate-select')).toBeVisible()
    await expect(mainPage.getByTestId('protocol-rtu-btn')).toBeVisible()
  })

  // ─── Protocol switching ─────────────────────────────────────────────

  test('switch to TCP hides RTU fields', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await mainPage.waitForTimeout(300)

    // TCP fields should be visible again
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()

    // RTU fields should be hidden
    await expect(mainPage.getByTestId('rtu-baudrate-select')).not.toBeVisible()

    // TCP button should be selected
    await expect(mainPage.getByTestId('protocol-tcp-btn')).toHaveClass(/Mui-selected/)
  })

  test('switching back to RTU preserves changed values', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-rtu-btn').click()
    await mainPage.waitForTimeout(300)

    // Previously changed values should still be set
    await expect(mainPage.getByTestId('rtu-baudrate-select')).toContainText('115200')
    await expect(mainPage.getByTestId('rtu-parity-select')).toContainText('even')
    await expect(mainPage.getByTestId('rtu-databits-select')).toContainText('7')
    await expect(mainPage.getByTestId('rtu-stopbits-select')).toContainText('2')
  })
})
