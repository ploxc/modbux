import { test, expect, resetApp } from '../../fixtures/electron-app'
import { unitIdField, navigateToClient, selectProtocol } from '../../fixtures/helpers'

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

// Switching to RTU keeps the unit id TCP allowed; the field turns red rather
// than the id being rewritten, and main refuses to send it.
test.describe.serial('A unit id above 247 over RTU', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('250 over Modbus TCP is not red', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusTcp')
    await (await unitIdField(mainPage)).fill('250')
    await expect(await unitIdField(mainPage)).toHaveValue('250')
    await expect(await unitIdField(mainPage)).toHaveAttribute('aria-invalid', 'false')
  })

  test('switching to RTU keeps 250 and turns it red', async ({ mainPage }) => {
    await selectProtocol(mainPage, 'ModbusRtu')
    await expect(await unitIdField(mainPage)).toHaveValue('250')
    await expect(await unitIdField(mainPage)).toHaveAttribute('aria-invalid', 'true')
  })

  test('247 over RTU is not red', async ({ mainPage }) => {
    await (await unitIdField(mainPage)).fill('247')
    await expect(await unitIdField(mainPage)).toHaveAttribute('aria-invalid', 'false')
  })

  test('back to Modbus TCP on unit id 1', async ({ mainPage }) => {
    await (await unitIdField(mainPage)).fill('1')
    await selectProtocol(mainPage, 'ModbusTcp')
    await expect(await unitIdField(mainPage)).toHaveValue('1')
  })
})
