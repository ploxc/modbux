import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  navigateToServer,
  connectClient,
  disconnectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  readRegisters
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-monitor.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-monitor.json')

/** The number of samples the chip counts, read off its text. */
const chipSamples = (text: string | null): number =>
  Number((/([\d,]+) samples/.exec(text ?? '')?.[1] ?? '0').replace(/,/g, ''))

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Logging — set in Debug, run from Monitor', () => {
  test('a server with registers, and a client mapping them', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await navigateToClient(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('Log in Debug lights up once a register logs', async ({ mainPage }) => {
    await readRegisters(mainPage, '0', '2')
    const cell = mainPage.getByTestId('log-cell-0')
    await expect(cell).toHaveAttribute('aria-pressed', 'false')

    await cell.click()
    await mainPage.getByTestId('log-mode-poll').click()
    await mainPage.keyboard.press('Escape')

    await expect(cell).toHaveAttribute('aria-pressed', 'true')
  })

  test('Monitor marks the row and counts it beside Enable logging', async ({ mainPage }) => {
    await mainPage.getByTestId('client-view-monitor-btn').click()

    await expect(mainPage.getByTestId('monitor-row-logs')).toHaveCount(1)
    await expect(mainPage.getByTestId('log-count')).toHaveText('1 register logs')
    await expect(mainPage.getByTestId('log-enable-btn')).toBeEnabled()
  })

  test('a poll fills the log, and the card says REC', async ({ mainPage }) => {
    await mainPage.getByTestId('log-enable-btn').click()
    await expect(mainPage.getByTestId('log-status-chip')).toContainText('waiting for Poll')

    await mainPage.getByTestId('poll-btn').click()
    await expect(async () => {
      const text = await mainPage.getByTestId('log-status-chip').textContent()
      expect(chipSamples(text)).toBeGreaterThan(0)
    }).toPass()
    await expect(mainPage.locator('[data-testid^="client-rec-"]')).toBeVisible()
  })

  test('stopping the poll asks first, and Keep polling keeps it', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-keep-btn').click()
    await expect(mainPage.getByTestId('log-status-chip')).not.toContainText('waiting for Poll')

    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-confirm-btn').click()
    await expect(mainPage.getByTestId('log-status-chip')).toContainText('waiting for Poll')
    await expect(mainPage.locator('[data-testid^="client-rec-"]')).toHaveCount(0)
  })

  test('the log keeps its samples after the poll stops', async ({ mainPage }) => {
    await mainPage.getByTestId('log-status-chip').click()
    await expect(mainPage.getByTestId('log-status-samples')).not.toHaveText(/^0 of/)
    await mainPage.keyboard.press('Escape')
  })

  test('Stop logging brings Enable logging back', async ({ mainPage }) => {
    await mainPage.getByTestId('log-stop-btn').click()
    await expect(mainPage.getByTestId('log-enable-btn')).toBeVisible()
  })

  test('Enable logging over samples asks, and Start new empties the log', async ({ mainPage }) => {
    await mainPage.getByTestId('log-enable-btn').click()
    await mainPage.getByTestId('log-start-new-btn').click()

    await expect(mainPage.getByTestId('log-status-chip')).toContainText('0 samples')
  })

  test("Don't ask again stops the next poll without asking", async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('log-status-chip')).not.toContainText(' 0 samples')
    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-dont-ask').click()
    await mainPage.getByTestId('stop-poll-confirm-btn').click()

    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('log-status-chip')).not.toContainText('waiting for Poll')
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('stop-poll-confirm-btn')).toHaveCount(0)
    await expect(mainPage.getByTestId('log-status-chip')).toContainText('waiting for Poll')
  })

  test('Clear log empties the log', async ({ mainPage }) => {
    await mainPage.getByTestId('log-status-chip').click()
    await mainPage.getByTestId('log-clear-btn').click()
    await expect(mainPage.getByTestId('log-status-samples')).toHaveText('0 of 1,000,000')
    await mainPage.keyboard.press('Escape')
    await mainPage.getByTestId('log-stop-btn').click()
  })

  test('cleanup', async ({ mainPage }) => {
    await mainPage.getByTestId('client-view-debug-btn').click()
    await disconnectClient(mainPage)
  })
})
