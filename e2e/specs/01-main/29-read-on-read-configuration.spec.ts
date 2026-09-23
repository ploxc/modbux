import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  selectRegisterType,
  expectCell,
  cell
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-large-config.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-large-config.json')

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

// Turning read configuration on fills the grid from the mapping, and every word
// in it is `dummyWords`, so address 0 reads 0 where the server holds 1 until a
// read. The switch asks for none. `19-large-config` drives the same two configs.
test.describe.serial('Read configuration shows the mapping, and Read fills it', () => {
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server config with 120 holding registers', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('navigate to client and load the matching mapping', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, CLIENT_CONFIG)
  })

  test('disconnected, it shows the mapping and no value', async ({ mainPage }) => {
    await enableReadConfiguration(mainPage)
    await expectCell(mainPage, 0, 'comment', 'reg-000')
    await expectCell(mainPage, 0, 'word_uint16', '0')
    await disableReadConfiguration(mainPage)
  })

  // The switch reads nothing: a read it fired could land after it went back.
  // A second after the switch the grid still holds the mapping's zeros, and
  // Read brings the values.
  test('connected, the switch reads nothing and Read brings the values', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await enableReadConfiguration(mainPage)
    await expectCell(mainPage, 0, 'comment', 'reg-000')
    await mainPage.waitForTimeout(1000)
    expect(await cell(mainPage, 0, 'word_uint16')).toBe('0')

    await mainPage.getByTestId('read-btn').click()

    await expectCell(mainPage, 0, 'word_uint16', '1')
    await expectCell(mainPage, 50, 'word_uint16', '51')
  })

  test('cleanup', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await disconnectClient(mainPage)
  })
})
