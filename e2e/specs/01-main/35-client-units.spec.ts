import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  cleanServerState,
  connectClient,
  disconnectClient,
  expectCell,
  loadServerConfig,
  navigateToClient
} from '../../fixtures/helpers'
import { resolve } from 'path'

// The server hosts unit 0, whose holding register 0 holds -100, and unit 1,
// whose holding register 0 holds 777. One client polls both, one tab each.
const SERVER_CONFIG = resolve(__dirname, '../../fixtures/config-files/server-integration.json')

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('A client with two units', () => {
  test('a server with units 0 and 1', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('the first unit reads one register of unit 0', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await mainPage.getByTestId('reg-address-input').locator('input').fill('0')
    await mainPage.getByTestId('reg-length-input').locator('input').fill('1')
  })

  test('a second unit, shown at once, reads one register of unit 1', async ({ mainPage }) => {
    await mainPage.getByTestId('add-unit-btn').click()
    await expect(mainPage.getByTestId('unit-tab-1')).toHaveAttribute('aria-selected', 'true')

    await mainPage.getByTestId('client-unitid-input').locator('input').fill('1')
    await mainPage.getByTestId('reg-address-input').locator('input').fill('0')
    await mainPage.getByTestId('reg-length-input').locator('input').fill('1')
  })

  test('one poll fills both tabs, each with its own unit', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()

    await expectCell(mainPage, 0, 'hex', '0309')
    await mainPage.getByTestId('unit-tab-0').click()
    await expect(mainPage.getByTestId('client-unitid-input').locator('input')).toHaveValue('0')
    await expectCell(mainPage, 0, 'hex', 'FF9C')

    await mainPage.getByTestId('poll-btn').click()
  })

  // Holding register 0 of unit 0 holds -100, and its input register 0 holds 200.
  test('two register types side by side, each read in its own section', async ({ mainPage }) => {
    await mainPage.getByTestId('unit-tab-0').click()
    await mainPage.getByTestId('side-by-side-btn').click()

    const holding = mainPage.getByTestId('section-grid-holding_registers')
    const input = mainPage.getByTestId('section-grid-input_registers')
    await expect(holding).toBeVisible()
    await expect(input).toBeVisible()
    // The input section's fields report their values as they mount, and the
    // holding section keeps the length of 1 the first test gave it.
    await expect(holding.getByTestId('reg-length-input').locator('input')).toHaveValue('1')

    await input.getByTestId('reg-address-input').locator('input').fill('0')
    await input.getByTestId('reg-length-input').locator('input').fill('1')
    await input.getByTestId('read-btn').click()

    // The input section reads its own window, and the holding section keeps the
    // row its poll left: each register type holds its own rows. Half the width
    // leaves the holding grid's hex column outside what it renders, so the row
    // is what is asked of it.
    await expect(input.locator('.MuiDataGrid-row[data-id="0"] [data-field="hex"]')).toHaveText(
      '00C8'
    )
    await expect(holding.locator('.MuiDataGrid-row[data-id="0"]')).toHaveCount(1)

    await mainPage.getByTestId('section-close-input_registers').click()
    await expect(input).toHaveCount(0)
  })

  test('the second unit goes, and the first stays', async ({ mainPage }) => {
    await mainPage.getByTestId('unit-tab-1').click()
    await mainPage.getByTestId('remove-unit-btn').click()

    await expect(mainPage.getByTestId('unit-tab-1')).toHaveCount(0)
    await expect(mainPage.getByTestId('unit-tab-0')).toHaveAttribute('aria-selected', 'true')
    await expect(mainPage.getByTestId('remove-unit-btn')).toHaveCount(0)
    await disconnectClient(mainPage)
  })
})
