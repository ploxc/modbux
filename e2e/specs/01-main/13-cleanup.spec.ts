import { test, expect } from '../../fixtures/electron-app'
import {
  loadServerConfig,
  selectUnitId,
  cleanServerState,
  clearRegisterType
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')
const SERVER_2_CONFIG = resolve(CONFIG_DIR, 'server-2.json')

test.describe.serial('Cleanup Operations', () => {
  // Setup: clean state first, then create full state to clean up
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('setup servers', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    // Add second server
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)
    await loadServerConfig(mainPage, SERVER_2_CONFIG)
  })

  test('clear server 2 register data', async ({ mainPage }) => {
    await clearRegisterType(mainPage, 'holding_registers')
    await clearRegisterType(mainPage, 'coils')
  })

  test('delete server 2', async ({ mainPage }) => {
    await mainPage.getByTestId('delete-server-btn').click()
    const remaining = mainPage.locator('[data-testid^="select-server-"]')
    await expect(remaining).toHaveCount(1)
    await expect(mainPage.getByTestId('select-server-502')).toBeVisible()
  })

  test('clear server 1, unit 1 data', async ({ mainPage }) => {
    await mainPage.getByTestId('select-server-502').click()
    await selectUnitId(mainPage, '1')
    await clearRegisterType(mainPage, 'holding_registers')
    await clearRegisterType(mainPage, 'input_registers')
    await clearRegisterType(mainPage, 'coils')
  })

  test('clear server 1, unit 0 data', async ({ mainPage }) => {
    await selectUnitId(mainPage, '0')
    await clearRegisterType(mainPage, 'coils')
    await clearRegisterType(mainPage, 'discrete_inputs')
    await clearRegisterType(mainPage, 'holding_registers')
    await clearRegisterType(mainPage, 'input_registers')
  })

  test('main server cannot be deleted', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('delete-server-btn')).toBeDisabled()
  })
})
