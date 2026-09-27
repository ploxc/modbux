import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  unitIdField,
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

    await (await unitIdField(mainPage)).fill('1')
    await mainPage.getByTestId('reg-address-input').locator('input').fill('0')
    await mainPage.getByTestId('reg-length-input').locator('input').fill('1')
  })

  test('one poll fills both tabs, each with its own unit', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()

    await expectCell(mainPage, 0, 'hex', '0309')
    await mainPage.getByTestId('unit-tab-0').click()
    await expect(await unitIdField(mainPage)).toHaveValue('0')
    await expectCell(mainPage, 0, 'hex', 'FF9C')

    await mainPage.getByTestId('poll-btn').click()
  })

  // Holding register 0 of unit 0 holds -100, and its input register 0 holds 200.
  test('a second register type turned on gets a section of its own', async ({ mainPage }) => {
    await mainPage.getByTestId('unit-tab-0').click()
    await mainPage.getByTestId('reg-type-input_registers-btn').click()

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
    // row its poll left: each register type holds its own rows.
    await expect(input.locator('.MuiDataGrid-row[data-id="0"] [data-field="hex"]')).toHaveText(
      '00C8'
    )
    await expect(holding.locator('.MuiDataGrid-row[data-id="0"]')).toHaveCount(1)
  })

  test('a second type starts below the first, and a drag puts it beside', async ({ mainPage }) => {
    const holding = mainPage.getByTestId('section-grid-holding_registers')
    const input = mainPage.getByTestId('section-grid-input_registers')
    const place = async (): Promise<{ below: boolean; beside: boolean }> => {
      const first = await holding.boundingBox()
      const second = await input.boundingBox()
      if (!first || !second) return { below: false, beside: false }
      return { below: second.y > first.y + 10, beside: second.x > first.x + 10 }
    }
    expect(await place()).toEqual({ below: true, beside: false })

    // The drop targets exist only while a drag runs, so the drag is made with
    // the mouse rather than by naming a target up front.
    const title = await mainPage.getByTestId('section-title-input_registers').boundingBox()
    const box = await holding.boundingBox()
    if (!title || !box) throw new Error('the sections are not on screen')
    await mainPage.mouse.move(title.x + title.width / 2, title.y + title.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width - 10, box.y + box.height / 2, { steps: 10 })
    await mainPage.mouse.up()

    await expect.poll(place).toEqual({ below: false, beside: true })
  })

  test('turning a type off takes its section away', async ({ mainPage }) => {
    await mainPage.getByTestId('reg-type-input_registers-btn').click()
    await expect(mainPage.getByTestId('section-grid-input_registers')).toHaveCount(0)
    await expect(mainPage.getByTestId('section-grid-holding_registers')).toBeVisible()
  })

  test('the second unit goes, and the first stays', async ({ mainPage }) => {
    await mainPage.getByTestId('unit-tab-1').click()
    await mainPage.getByTestId('remove-unit-btn').click()

    await expect(mainPage.getByTestId('unit-tab-1')).toHaveCount(0)
    await expect(mainPage.getByTestId('unit-tab-0')).toHaveAttribute('aria-selected', 'true')
    await expect(mainPage.getByTestId('remove-unit-btn')).toHaveCount(0)
    await disconnectClient(mainPage)
  })

  // Both act on every open panel of the unit, not only on the type last read.
  test('dummy data and Clear reach every open panel', async ({ mainPage }) => {
    await mainPage.getByTestId('reg-type-input_registers-btn').click()
    const holding = mainPage.getByTestId('section-grid-holding_registers')
    const input = mainPage.getByTestId('section-grid-input_registers')

    await mainPage.getByTestId('load-dummy-data-btn').click()
    await expect(holding.locator('.MuiDataGrid-row')).toHaveCount(1)
    await expect(input.locator('.MuiDataGrid-row')).toHaveCount(1)

    await mainPage.getByTestId('clear-data-btn').click()
    await expect(holding.locator('.MuiDataGrid-row')).toHaveCount(0)
    await expect(input.locator('.MuiDataGrid-row')).toHaveCount(0)
  })
})
