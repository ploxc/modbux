import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  navigateToHome,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  clearData,
  loadServerConfig,
  loadClientConfig,
  selectRegisterType,
  splitOutServerWindow,
  expectCell
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { type Page } from '@playwright/test'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-large-config.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-large-config.json')

let serverPage: Page

// Both windows load the one renderer bundle, so both evaluate
// `client.zustand`'s module scope, and `init` there called
// `setReadConfiguration(false)` with no addressee. The main window's toggle
// still read on, and the next read went out as one flat `[address, length]`
// block instead of the mapping's groups: the length field holds 10, so every
// configured register above address 9 stopped being read. Only two windows can
// see it.
test.describe.serial('Read configuration survives the split out server window', () => {
  test.afterAll(async ({ electronApp }) => {
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .filter((w) => w.getTitle() === 'Server')
        .forEach((w) => w.close())
    })
  })

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load 120 holding registers into the server and the matching mapping', async ({
    mainPage
  }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, CLIENT_CONFIG)
  })

  test('connected, read configuration fills every configured register', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await enableReadConfiguration(mainPage)

    await expectCell(mainPage, 0, 'word_uint16', '1')
    await expectCell(mainPage, 50, 'word_uint16', '51')
  })

  test('the split out window leaves the mapping reading', async ({ electronApp, mainPage }) => {
    await navigateToHome(mainPage)
    serverPage = await splitOutServerWindow(electronApp, mainPage)
    await expect(serverPage.getByTestId('section-holding_registers')).toBeVisible()

    // The rows the previous test read already satisfy the assertion below, and
    // the read that would empty them lands after it. Clear them first, so the
    // grid has to be filled again rather than left alone.
    await clearData(mainPage)
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="50"]')).toHaveCount(0)

    await mainPage.getByTestId('read-btn').click()

    await expectCell(mainPage, 50, 'word_uint16', '51')
  })

  test('cleanup', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await disconnectClient(mainPage)
  })
})
