import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  cleanServerState,
  loadServerConfig,
  readRegisters,
  clearData
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-large-config.json')

test.describe.serial('Read after config load — init readConfiguration sync', () => {
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server config', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('normal read works before desync', async ({ mainPage }) => {
    await readRegisters(mainPage, '0', '10')
  })

  test('inject readConfiguration=true into backend and clear grid', async ({ mainPage }) => {
    // Simulate the init() desync: backend gets readConfiguration=true
    // but frontend has it false. Backend has no registerMapping.
    await mainPage.evaluate(() => {
      window.api.setReadConfiguration(true)
    })
    await mainPage.waitForTimeout(200)

    // Clear the grid so we can verify the next read actually produces data
    await clearData(mainPage)
  })

  test('read after desync — grid should still show data', async ({ mainPage }) => {
    // Frontend has readConfiguration=false, backend has readConfiguration=true.
    // Without the fix: backend uses groupAddressInfos(undefined) → [] → no data.
    const readBtn = mainPage.getByTestId('read-btn')
    await readBtn.click()

    // If the bug is present, no rows will appear (silent failure)
    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row0).toBeVisible({ timeout: 5000 })
  })

  test('cleanup', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
