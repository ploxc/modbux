import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  navigateToServer,
  connectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  readRegisters,
  expectCell
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { readFile } from 'fs/promises'
import { evaluateMain } from '../../fixtures/launch'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-monitor.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-monitor.json')

/** The number of samples the log holds, read off "3,412 of 1,000,000". */
const samplesOf = (text: string | null): number =>
  Number((/^([\d,]+) of/.exec(text ?? '')?.[1] ?? '0').replace(/,/g, ''))

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

  test('Monitor marks the row and counts it; the log button beside Poll takes a press', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('client-view-monitor-btn').click()

    await expect(mainPage.locator('[data-testid^="monitor-trend-"]')).toHaveCount(1)
    await expect(mainPage.getByTestId('log-count')).toHaveText('1 register logs')
    await expect(mainPage.getByTestId('log-btn')).toBeEnabled()
  })

  test('the log button turns Poll into Log, and a poll fills the log', async ({ mainPage }) => {
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-turn-on-btn').click()
    await expect(mainPage.getByTestId('log-btn')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Log')

    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')
    await mainPage.getByTestId('log-btn').click()
    await expect(async () => {
      const text = await mainPage.getByTestId('log-status-samples').textContent()
      expect(samplesOf(text)).toBeGreaterThan(0)
    }).toPass()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.locator('[data-testid^="client-rec-"]')).toBeVisible()
  })

  test('the Log icon in a row opens the trend of that register, live', async ({ mainPage }) => {
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()

    await expect(mainPage.getByTestId('trend-panel')).toBeVisible()
    await expect(mainPage.getByTestId('trend-state')).toHaveText('live')
    await expect(mainPage.getByTestId('trend-chip-value-0')).toContainText('100')
    await expect(mainPage.locator('[data-testid="trend-chart"] canvas')).toHaveCount(1)
    await expect(mainPage.getByTestId('monitor-trend-0-holding_registers-0')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // The page under it stays reachable, to screen readers and role queries alike.
    await expect(mainPage.getByRole('switch', { name: 'Poll this group' }).first()).toBeVisible()

    // The cursor over the lines reads every line at the sample under it.
    const over = mainPage.locator('[data-testid="trend-chart"] .u-over')
    const plotBox = await over.boundingBox()
    if (!plotBox) throw new Error('The trend has no plot to hover')
    await mainPage.mouse.move(plotBox.x + plotBox.width - 4, plotBox.y + plotBox.height / 2)
    await expect(mainPage.getByTestId('trend-readout')).toContainText('100')
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)
    await expect(mainPage.getByTestId('trend-readout')).toHaveCount(0)

    // A longer range asks main again, and the register's value comes back with it.
    await mainPage.getByTestId('trend-range-1h').click()
    await expect(mainPage.getByTestId('trend-range-1h')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-chip-value-0')).toContainText('100')
    await mainPage.getByTestId('trend-range-10m').click()

    // A drag across the lines zooms to it, and the trend holds still until
    // Back to live. The whole log fills the plot, so the drag lands on it.
    await expect(mainPage.getByTestId('trend-navigator')).toBeVisible()
    await mainPage.getByTestId('trend-range-log').click()
    // A view is a second long at least, so the log needs a few to zoom into.
    const held = mainPage.getByTestId('trend-navigator-window')
    await expect(async () => {
      const start = Number(await held.getAttribute('aria-valuemin'))
      const end = Number(await held.getAttribute('aria-valuemax'))
      expect(end - start).toBeGreaterThan(3000)
    }).toPass()
    const plot = mainPage.locator('[data-testid="trend-chart"] .u-over')
    const box = await plot.boundingBox()
    if (!box) throw new Error('The trend has no plot to drag across')
    await mainPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    await expect(mainPage.getByTestId('trend-state')).toHaveText('paused')
    await expect(mainPage.getByTestId('trend-view')).toBeVisible()
    // The arrow keys on the navigator's window pan the stretch shown.
    const zoomed = await held.getAttribute('aria-valuenow')
    await held.focus()
    await mainPage.keyboard.press('ArrowLeft')
    await expect(held).not.toHaveAttribute('aria-valuenow', zoomed ?? '')
    await mainPage.getByTestId('trend-live-btn').click()
    await expect(mainPage.getByTestId('trend-state')).toHaveText('live')
    await expect(mainPage.getByTestId('trend-zoom-out-btn')).toBeDisabled()
    await mainPage.getByTestId('trend-range-10m').click()

    await mainPage.getByTestId('trend-chip-remove-0').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveCount(0)
  })

  test("Debug shows Monitor's reads while logging, and reads nothing itself", async ({
    mainPage
  }) => {
    await mainPage.getByTestId('client-view-debug-btn').click()

    await expect(mainPage.getByTestId('debug-monitor-polls').first()).toBeVisible()
    await expect(mainPage.getByTestId('read-btn').first()).toBeDisabled()
    await expect(mainPage.getByTestId('reg-read-config-btn')).toBeDisabled()
    await expect(mainPage.getByTestId('reg-read-config-btn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(
      mainPage.getByTestId('section-poll-switch').first().getByRole('switch')
    ).toBeDisabled()
    await expectCell(mainPage, 0, 'value', '100')

    await mainPage.getByTestId('client-view-monitor-btn').click()
  })

  test('stopping the poll asks first, and Keep polling keeps it', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-keep-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')

    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-confirm-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Log')
    await expect(mainPage.locator('[data-testid^="client-rec-"]')).toHaveCount(0)
  })

  test('the log keeps its samples after the poll stops, and waits for the poll', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('log-btn').click()
    await expect(mainPage.getByTestId('log-status-samples')).not.toHaveText(/^0 of/)
    await expect(mainPage.getByTestId('log-status-heading')).toContainText('press Log to start')
    await mainPage.keyboard.press('Escape')
  })

  test('Turn logging off brings Poll back', async ({ mainPage }) => {
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-turn-off-btn').click()

    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Poll')
    await expect(mainPage.getByTestId('log-btn')).toHaveAttribute('aria-pressed', 'false')
  })

  test('enabling over samples asks, and Start new empties the log', async ({ mainPage }) => {
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-start-new-btn').click()

    await mainPage.getByTestId('log-btn').click()
    await expect(mainPage.getByTestId('log-status-samples')).toHaveText('0 of 1,000,000')
    await mainPage.keyboard.press('Escape')
  })

  test("Don't ask again stops the next poll without asking", async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')
    await mainPage.getByTestId('poll-btn').click()
    await mainPage.getByTestId('stop-poll-dont-ask').click()
    await mainPage.getByTestId('stop-poll-confirm-btn').click()

    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('stop-poll-confirm-btn')).toHaveCount(0)
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Log')
  })

  test('Export CSV writes every sample of the ticked registers', async ({
    electronApp,
    mainPage
  }) => {
    const savePath = resolve(tmpdir(), `modbux-log-export-${Date.now()}.csv`)
    await evaluateMain(() =>
      electronApp.evaluate(({ session }, path) => {
        session.defaultSession.once('will-download', (_event, item) => {
          item.setSavePath(path)
        })
      }, savePath)
    )

    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-export-open-btn').click()
    await expect(mainPage.getByTestId('log-export-tree')).toContainText('setpoint')
    await mainPage.getByTestId('log-export-btn').click()

    // The file exists before the download has written into it.
    let csv = ''
    await expect(async () => {
      csv = await readFile(savePath, 'utf-8')
      expect(csv).toMatch(/\n.*\n/)
    }).toPass()
    const lines = csv.split('\n')
    expect(lines[0]).toMatch(/^# Modbux log of /)
    expect(lines[2]).toBe(
      'time,unit_id,unit,register_type,address,name,raw,value,engineering_unit,status'
    )
    expect(lines.length).toBeGreaterThan(3)
    expect(lines.slice(3).every((line) => line.includes(',holding_registers,0,setpoint,'))).toBe(
      true
    )
    await mainPage.keyboard.press('Escape')
  })

  test('Clear log empties the log', async ({ mainPage }) => {
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-clear-btn').click()
    await expect(mainPage.getByTestId('log-status-samples')).toHaveText('0 of 1,000,000')
    await mainPage.keyboard.press('Escape')
  })

  test('Turn logging off while polling asks, and the poll goes on', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')

    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-turn-off-btn').click()
    await mainPage.getByTestId('log-off-confirm-btn').click()

    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Polling')
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Poll')
  })

  test('Disconnect asks first while logging, from the top bar and the card', async ({
    mainPage
  }) => {
    // The log holds the last run's samples, so the log button asks first.
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-start-append-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Log')
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')

    await mainPage.getByTestId('connect-btn').click()
    await mainPage.getByTestId('disconnect-log-keep-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toHaveText('Disconnect')

    await mainPage.locator('[data-testid^="client-menu-"]').click()
    await mainPage.locator('[data-testid^="client-connect-"]').click()
    await mainPage.getByTestId('disconnect-log-confirm-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toHaveText('Connect')
  })

  test('cleanup', async ({ mainPage }) => {
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-turn-off-btn').click()
    await mainPage.getByTestId('client-view-debug-btn').click()
  })
})
