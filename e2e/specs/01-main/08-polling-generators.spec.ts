import { test, expect } from '../../fixtures/electron-app'
import {
  selectRegisterType,
  cell,
  readRegisters,
  clearData,
  loadServerConfig,
  connectClient,
  disconnectClient,
  navigateToServer,
  navigateToClient,
  enableAdvancedMode,
  cleanServerState
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')
const SERVER_2_CONFIG = resolve(CONFIG_DIR, 'server-2.json')

test.describe.serial('Polling and Generator verification', () => {
  let server2Port: string

  // ─── Setup: clean state and configure both servers with generators ──

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server 1 config', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
  })

  test('add second server and load config', async ({ mainPage }) => {
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)
    await loadServerConfig(mainPage, SERVER_2_CONFIG)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
  })

  test('navigate to client and enable advanced mode', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
  })

  // ─── Server 1 polling ──────────────────────────────────────────────

  test.describe.serial('Server 1 polling', () => {
    test('connect to server 1 and read initial generator value', async ({ mainPage }) => {
      await connectClient(mainPage, '127.0.0.1', '502', '0')
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '25', '1')

      const hex = await cell(mainPage, 25, 'hex')
      const val = parseInt(hex, 16)
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThanOrEqual(1000)
    })

    test('poll and verify generator values change', async ({ mainPage }) => {
      // Read initial value
      const hex1 = await cell(mainPage, 25, 'hex')
      const val1 = parseInt(hex1, 16)

      // Start polling
      await mainPage.getByTestId('poll-btn').click()
      await mainPage.waitForTimeout(3000)

      // Read new value after polling
      const hex2 = await cell(mainPage, 25, 'hex')
      const val2 = parseInt(hex2, 16)

      // Both values should be in range 0-1000
      expect(val1).toBeGreaterThanOrEqual(0)
      expect(val1).toBeLessThanOrEqual(1000)
      expect(val2).toBeGreaterThanOrEqual(0)
      expect(val2).toBeLessThanOrEqual(1000)

      // Stop polling
      await mainPage.getByTestId('poll-btn').click()
      await mainPage.waitForTimeout(300)
      await clearData(mainPage)
    })

    test('disconnect from server 1', async ({ mainPage }) => {
      await disconnectClient(mainPage)
    })
  })

  // ─── Server 2 polling ──────────────────────────────────────────────

  test.describe.serial('Server 2 polling', () => {
    test('get server 2 port and connect', async ({ mainPage }) => {
      await navigateToServer(mainPage)

      const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
      const secondServer = toggleButtons.nth(1)
      await secondServer.click()
      await mainPage.waitForTimeout(300)

      const portInput = mainPage.getByTestId('server-port-input').locator('input')
      server2Port = await portInput.inputValue()

      await navigateToClient(mainPage)
      await connectClient(mainPage, '127.0.0.1', server2Port, '0')
    })

    test('poll server 2 generator and verify changes', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '1', '1')

      // Read initial value
      const hex1 = await cell(mainPage, 1, 'hex')
      const val1 = parseInt(hex1, 16)

      // Start polling — wait longer due to interval=3s
      await mainPage.getByTestId('poll-btn').click()
      await mainPage.waitForTimeout(5000)

      // Read new value after polling
      const hex2 = await cell(mainPage, 1, 'hex')
      const val2 = parseInt(hex2, 16)

      // Both values should be in range 10-90
      expect(val1).toBeGreaterThanOrEqual(10)
      expect(val1).toBeLessThanOrEqual(90)
      expect(val2).toBeGreaterThanOrEqual(10)
      expect(val2).toBeLessThanOrEqual(90)

      // Stop polling
      await mainPage.getByTestId('poll-btn').click()
      await mainPage.waitForTimeout(300)
      await clearData(mainPage)
    })

    test('disconnect from server 2', async ({ mainPage }) => {
      await disconnectClient(mainPage)
    })
  })
})
