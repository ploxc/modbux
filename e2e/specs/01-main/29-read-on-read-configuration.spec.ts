import { test } from '../../fixtures/electron-app'
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
  expectCell
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-large-config.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-large-config.json')

// Turning read configuration on fills the grid from the mapping, and every word
// in it is `dummyWords`, so address 0 reads 0 where the server holds 1. The
// store asks main for a read, and only while main can answer one: nothing
// presses Read here. `19-large-config` drives the same two configs and presses
// it.
test.describe.serial('Read configuration reads what it just put on screen', () => {
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

  test('connected, the values are there without pressing Read', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await enableReadConfiguration(mainPage)

    await expectCell(mainPage, 0, 'word_uint16', '1')
    await expectCell(mainPage, 50, 'word_uint16', '51')
  })

  test('cleanup', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await disconnectClient(mainPage)
  })
})
