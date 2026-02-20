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

  test('switch to RTU protocol', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-rtu-btn').click()
    await mainPage.waitForTimeout(300)

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

  test('stop bits select has expected options', async ({ mainPage }) => {
    await mainPage.getByTestId('rtu-stopbits-select').click()
    await mainPage.waitForTimeout(200)

    await expect(mainPage.getByRole('option', { name: '1' })).toBeVisible()
    await expect(mainPage.getByRole('option', { name: '2' })).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
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

    // Verify the page is still functional (no crash)
    await expect(mainPage.getByTestId('rtu-baudrate-select')).toBeVisible()
    await expect(mainPage.getByTestId('protocol-rtu-btn')).toBeVisible()
  })

  // ─── Protocol switching ─────────────────────────────────────────────

  test('switch back to TCP preserves protocol state', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await mainPage.waitForTimeout(300)

    // TCP fields should be visible again
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()

    // TCP button should be selected
    const tcpBtn = mainPage.getByTestId('protocol-tcp-btn')
    await expect(tcpBtn).toHaveClass(/Mui-selected/)
  })
})
