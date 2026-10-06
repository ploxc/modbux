import type { Page } from '@playwright/test'
import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  navigateToServer,
  connectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  readRegisters,
  expectCell,
  selectRegisterType
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

/** Whether the trend follows the log or holds still, read off which of the two is pressed. */
const expectState = async (mainPage: Page, state: 'live' | 'paused'): Promise<void> => {
  await expect(mainPage.getByTestId(`trend-${state}-btn`)).toHaveAttribute('aria-pressed', 'true')
}

/**
 * Waits for the readout at the plot's right edge, which reads the newest
 * sample of every register the trend draws, to show `text` in `row`. The
 * mouse moves in again on every try, because a plot made again for new lines
 * shows no readout until the cursor moves over it. A live trend moves under a
 * cursor that stands still, so the moment it reads follows the log.
 */
const expectNewest = async (
  mainPage: Page,
  row: string,
  text: string,
  timeout?: number
): Promise<void> => {
  const plot = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
  await expect(async () => {
    const plotBox = await plot.boundingBox()
    if (!plotBox) throw new Error('The trend has no plot to hover')
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)
    await mainPage.mouse.move(plotBox.x + plotBox.width - 2, plotBox.y + plotBox.height / 2)
    await expect(mainPage.getByTestId(row)).toHaveText(text, { timeout: 1000 })
  }).toPass({ timeout })
  const plotBox = await plot.boundingBox()
  if (plotBox) await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)
}

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

    // The row icons, and not the toolbar's Trend.
    await expect(mainPage.locator('[data-testid^="monitor-trend-0-"]')).toHaveCount(1)
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
    await expectState(mainPage, 'live')
    await expect(mainPage.locator('[data-testid="trend-plot-0"] canvas')).toHaveCount(1)
    await expectNewest(mainPage, 'trend-readout-value-0', '100')
    await expect(mainPage.getByTestId('monitor-trend-0-holding_registers-0')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    // The page beside it stays reachable, to screen readers and role queries alike.
    await expect(mainPage.getByRole('switch', { name: 'Poll this group' }).first()).toBeVisible()

    // The cursor over the lines reads every line at or before the moment under
    // it. The whole log fills the plot, so every moment of it has a sample.
    await mainPage.getByTestId('trend-range-log').click()
    const over = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
    const plotBox = await over.boundingBox()
    if (!plotBox) throw new Error('The trend has no plot to hover')
    await mainPage.mouse.move(plotBox.x + plotBox.width * 0.9, plotBox.y + plotBox.height / 2)
    await expect(mainPage.getByTestId('trend-readout-value-0')).toHaveText('100')
    // Emotion never removes a class, so a readout placed through one would
    // leave a rule behind for every place the cursor stops.
    const cssRules = (): Promise<number> =>
      mainPage.evaluate(() =>
        Array.from(document.styleSheets).reduce((sum, sheet) => sum + sheet.cssRules.length, 0)
      )
    const rulesBefore = await cssRules()
    for (let step = 1; step <= 10; step++)
      await mainPage.mouse.move(
        plotBox.x + plotBox.width * (0.4 + step * 0.04),
        plotBox.y + plotBox.height * (0.2 + step * 0.05)
      )
    await expect(mainPage.getByTestId('trend-readout-value-0')).toHaveText('100')
    expect(await cssRules()).toBe(rulesBefore)
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)
    await expect(mainPage.getByTestId('trend-readout')).toHaveCount(0)
    await mainPage.getByTestId('trend-range-10m').click()

    // A longer range asks main again, and the register's value comes back with it.
    await mainPage.getByTestId('trend-range-1h').click()
    await expect(mainPage.getByTestId('trend-range-1h')).toHaveAttribute('aria-pressed', 'true')
    // Over an hour a pixel is seconds long, so the edge reads a sample only
    // once the log is older than the two pixels it stands from the end.
    await expectNewest(mainPage, 'trend-readout-value-0', '100', 30_000)
    await mainPage.getByTestId('trend-range-10m').click()

    // Paused holds the range's stretch still while the log runs on, and the
    // range stays pressed; Live, or a press on that range, follows the log again.
    const stretch = mainPage.getByTestId('trend-navigator-window')
    await mainPage.getByTestId('trend-paused-btn').click()
    await expectState(mainPage, 'paused')
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-view')).toHaveCount(0)
    const pausedOn = await stretch.getAttribute('aria-valuetext')
    await mainPage.waitForTimeout(2500)
    await expect(stretch).toHaveAttribute('aria-valuetext', pausedOn ?? '')
    await mainPage.getByTestId('trend-live-btn').click()
    await expectState(mainPage, 'live')
    await expect(stretch).not.toHaveAttribute('aria-valuetext', pausedOn ?? '')
    await mainPage.getByTestId('trend-paused-btn').click()
    await expectState(mainPage, 'paused')
    await mainPage.getByTestId('trend-range-10m').click()
    await expectState(mainPage, 'live')

    // 420 px wide the header wraps under the name and the ranges, and the
    // icons stay on the first row, inside the panel.
    const trendBox = mainPage.getByTestId('trend-panel').locator('xpath=..')
    await trendBox.evaluate((el) => {
      el.style.width = '420px'
    })
    const boxOf = async (testId: string): Promise<{ x: number; y: number; right: number }> => {
      const box = await mainPage.getByTestId(testId).boundingBox()
      if (!box) throw new Error(`${testId} is not drawn`)
      return { x: box.x, y: box.y, right: box.x + box.width }
    }
    await expect(async () => {
      const panel = await boxOf('trend-panel')
      const close = await boxOf('trend-close-btn')
      const name = await boxOf('trend-config-btn')
      const range = await boxOf('trend-range-10m')
      const live = await boxOf('trend-live-btn')
      expect(close.right).toBeLessThanOrEqual(panel.right)
      expect(close.y).toBe(name.y)
      expect(live.y).toBeGreaterThan(range.y)
    }).toPass()
    await trendBox.evaluate((el) => {
      el.style.width = ''
    })

    // The calendar opens on the stretch shown, and Show holds the trend still
    // on the stretch picked, which the calendar stays pressed on.
    const calendar = mainPage.getByTestId('trend-range-calendar')
    await calendar.click()
    await mainPage.getByTestId('trend-stretch-show-btn').click()
    await expect(mainPage.getByTestId('trend-stretch-show-btn')).toHaveCount(0)
    await expectState(mainPage, 'paused')
    await expect(calendar).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-view')).toContainText(' to ')
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'false')
    // A From before the log's start is refused, and Cancel leaves the stretch.
    await calendar.click()
    await mainPage
      .getByTestId('trend-stretch-from')
      .getByRole('spinbutton', { name: 'Year' })
      .click()
    await mainPage.keyboard.type('2020')
    await expect(mainPage.getByTestId('trend-stretch-show-btn')).toBeDisabled()
    await mainPage.getByTestId('trend-stretch-cancel-btn').click()
    await expect(calendar).toHaveAttribute('aria-pressed', 'true')
    await mainPage.getByTestId('trend-live-btn').click()
    await expectState(mainPage, 'live')
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'true')

    // A drag across the lines selects a stretch, Zoom to range zooms to it,
    // and the trend holds still until Live is pressed. The whole log fills the
    // plot, so the drag lands on it.
    await expect(mainPage.getByTestId('trend-navigator')).toBeVisible()
    await mainPage.getByTestId('trend-range-log').click()
    // A view is a second long at least, so the log needs a few to zoom into.
    const held = mainPage.getByTestId('trend-navigator-window')
    await expect(async () => {
      const start = Number(await held.getAttribute('aria-valuemin'))
      const end = Number(await held.getAttribute('aria-valuemax'))
      expect(end - start).toBeGreaterThan(3000)
    }).toPass()
    const plot = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
    const box = await plot.boundingBox()
    if (!box) throw new Error('The trend has no plot to drag across')
    await mainPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    await mainPage.getByTestId('trend-selection-zoom-btn').click()
    await expectState(mainPage, 'paused')
    await expect(mainPage.getByTestId('trend-view')).toBeVisible()
    // Zoomed, the trend shows no range, so no range is pressed.
    await expect(mainPage.getByTestId('trend-range-log')).toHaveAttribute('aria-pressed', 'false')
    // The arrow keys on the navigator's window pan the stretch shown.
    const zoomed = await held.getAttribute('aria-valuenow')
    await held.focus()
    await mainPage.keyboard.press('ArrowLeft')
    await expect(held).not.toHaveAttribute('aria-valuenow', zoomed ?? '')
    await mainPage.getByTestId('trend-live-btn').click()
    await expectState(mainPage, 'live')

    // A double click zooms out to the range as well.
    await mainPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    await mainPage.getByTestId('trend-selection-zoom-btn').click()
    await expectState(mainPage, 'paused')
    await mainPage.mouse.dblclick(box.x + box.width * 0.5, box.y + box.height / 2)
    await expectState(mainPage, 'live')
    await expect(mainPage.getByTestId('trend-range-log')).toHaveAttribute('aria-pressed', 'true')

    // Zoomed again, and the navigator's window dragged against the log's end,
    // the trend follows the log over the window's own length.
    await mainPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    await mainPage.getByTestId('trend-selection-zoom-btn').click()
    await expectState(mainPage, 'paused')
    const windowBox = await held.boundingBox()
    const stripBox = await mainPage.getByTestId('trend-navigator').boundingBox()
    if (!windowBox || !stripBox) throw new Error('The navigator is not drawn')
    const middle = windowBox.y + windowBox.height / 2
    await mainPage.mouse.move(windowBox.x + windowBox.width / 2, middle)
    await mainPage.mouse.down()
    await mainPage.mouse.move(stripBox.x + stripBox.width + 100, middle, { steps: 5 })
    await mainPage.mouse.up()
    await expectState(mainPage, 'live')
    await expect(mainPage.getByTestId('trend-follow')).toBeVisible()
    await expect(mainPage.getByTestId('trend-range-log')).toHaveAttribute('aria-pressed', 'false')
    const following = Number(await held.getAttribute('aria-valuenow'))
    await expect(async () => {
      expect(Number(await held.getAttribute('aria-valuenow'))).toBeGreaterThan(following)
    }).toPass()

    // A press on a range follows the log over that range again.
    await mainPage.getByTestId('trend-range-10m').click()
    await expectState(mainPage, 'live')
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'true')

    // The row's Log icon takes the register out again, which leaves the trend
    // open and empty.
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()
    await expect(mainPage.getByTestId('trend-empty')).toBeVisible()
    await expect(mainPage.getByTestId('monitor-trend-0-holding_registers-0')).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    await mainPage.getByTestId('trend-close-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveCount(0)
  })

  test("Monitor's Trend opens the trend as it was left, and Add register fills it", async ({
    mainPage
  }) => {
    await mainPage.getByTestId('monitor-trend-btn').click()
    await expect(mainPage.getByTestId('trend-empty')).toBeVisible()

    await mainPage.getByTestId('trend-add-btn').click()
    await mainPage.getByTestId('trend-add-search').fill('setpoint')
    await mainPage.getByTestId('trend-pick-0-holding_registers-0').click()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('trend-chip-holding_registers-0')).toBeVisible()
    await expectNewest(mainPage, 'trend-readout-value-0', '100')
    await expect(mainPage.getByTestId('monitor-trend-count')).toHaveText('1')

    // Closed and opened again, it draws what it drew.
    await mainPage.getByTestId('monitor-trend-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveCount(0)
    await mainPage.getByTestId('monitor-trend-btn').click()
    await expect(mainPage.getByTestId('trend-chip-holding_registers-0')).toBeVisible()

    await mainPage.getByTestId('trend-chip-remove-holding_registers-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
  })

  test('Axes and lines hold an engineering unit, and set the time axis and the drawing', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()
    // A plot per engineering unit, each with its axis and none for time; the
    // register has no unit.
    await expect(mainPage.locator('[data-testid="trend-plot-0"] .u-axis')).toHaveCount(1)
    await mainPage.getByTestId('trend-settings-btn').click()
    await expect(mainPage.getByTestId('trend-axis-0-unit')).toHaveText('No unit')
    // A panel beside the trend: the trend takes a press while it stays open,
    // and a second press on its button closes it.
    await mainPage.getByTestId('trend-range-1h').click()
    await expect(mainPage.getByTestId('trend-range-1h')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByRole('region', { name: 'Axes and lines' })).toBeVisible()
    await mainPage.getByTestId('trend-range-10m').click()
    await mainPage.getByTestId('trend-settings-btn').click()
    await expect(mainPage.getByRole('region', { name: 'Axes and lines' })).toHaveCount(0)
    await mainPage.getByTestId('trend-settings-btn').click()

    // Fixed holds the range the axis shows: uPlot draws a flat 100 from 0 to 200.
    await mainPage.getByTestId('trend-axis-0-fixed').click()
    await expect(mainPage.getByTestId('trend-axis-0-min')).toHaveValue('0')
    await expect(mainPage.getByTestId('trend-axis-0-max')).toHaveValue('200')
    await mainPage.getByTestId('trend-axis-0-max').fill('250')
    await mainPage.getByTestId('trend-time-since').click()
    await mainPage.getByTestId('trend-draw-steps').click()
    await mainPage.keyboard.press('Escape')

    // The readout writes the time since the trend's start.
    await mainPage.getByTestId('trend-range-log').click()
    const over = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
    const plotBox = await over.boundingBox()
    if (!plotBox) throw new Error('The trend has no plot to hover')
    await mainPage.mouse.move(plotBox.x + plotBox.width * 0.9, plotBox.y + plotBox.height / 2)
    await expect(mainPage.getByTestId('trend-readout-time')).toHaveText(/^\d+:\d\d$/)
    await expect(mainPage.getByTestId('trend-readout-value-0')).toHaveText('100')
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)
    // It counts from the log's oldest sample, not from the edge of the range:
    // on 10 minutes of a log seconds old, it is under a minute.
    await mainPage.getByTestId('trend-range-10m').click()
    await mainPage.mouse.move(plotBox.x + plotBox.width - 2, plotBox.y + plotBox.height / 2)
    await expect(mainPage.getByTestId('trend-readout-time')).toHaveText(/^0:\d\d$/)
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)

    // Back as it was, for the tests after this one.
    await mainPage.getByTestId('trend-settings-btn').click()
    await mainPage.getByTestId('trend-axis-0-auto').click()
    await mainPage.getByTestId('trend-time-clock').click()
    await mainPage.getByTestId('trend-draw-lines').click()
    await mainPage.keyboard.press('Escape')
    await mainPage.getByTestId('trend-range-10m').click()
    await mainPage.getByTestId('trend-chip-remove-holding_registers-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
  })

  test('a trend saves under a name with its client, and loads, renames and deletes', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()
    await mainPage.getByTestId('trend-range-1h').click()

    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-save-as-btn').click()
    await mainPage.getByTestId('trend-name-input').fill('Setpoint')
    await mainPage.getByTestId('trend-name-confirm-btn').click()
    await expect(mainPage.getByTestId('trend-config-btn')).toHaveText('Setpoint')

    // A new trend draws nothing; the saved one draws its register and range again.
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-new-btn').click()
    await expect(mainPage.getByTestId('trend-empty')).toBeVisible()
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'true')
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-saved-Setpoint').click()
    await expect(mainPage.getByTestId('trend-chip-holding_registers-0')).toBeVisible()
    await expect(mainPage.getByTestId('trend-range-1h')).toHaveAttribute('aria-pressed', 'true')

    // Changed since it was saved, it says so, and Save keeps the change.
    await mainPage.getByTestId('trend-range-8h').click()
    await expect(mainPage.getByTestId('trend-changed')).toBeVisible()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-save-btn').click()
    await expect(mainPage.getByTestId('trend-changed')).toHaveCount(0)

    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-rename-btn').click()
    await mainPage.getByTestId('trend-name-input').fill('Target')
    await mainPage.getByTestId('trend-name-confirm-btn').click()
    await expect(mainPage.getByTestId('trend-config-btn')).toHaveText('Target')

    // A long name, with spaces or none, gives way inside a trend 420 px wide:
    // one line, clear of the icons.
    const trendBox = mainPage.getByTestId('trend-panel').locator('xpath=..')
    await trendBox.evaluate((el) => {
      el.style.width = '420px'
    })
    for (const longName of [
      'Setpoints of the second boiler room, left wing, floor three',
      'Setpoints_of_the_second_boiler_room_left_wing_floor_three'
    ]) {
      await mainPage.getByTestId('trend-config-btn').click()
      await mainPage.getByTestId('trend-rename-btn').click()
      await mainPage.getByTestId('trend-name-input').fill(longName)
      await mainPage.getByTestId('trend-name-confirm-btn').click()
      // The button is as tall as the theme makes it, so a second line of the
      // name shows in the text's own height.
      const nameText = mainPage.getByTestId('trend-config-btn').getByText(longName)
      await expect(async () => {
        const name = await mainPage.getByTestId('trend-config-btn').boundingBox()
        const text = await nameText.boundingBox()
        const settings = await mainPage.getByTestId('trend-settings-btn').boundingBox()
        if (!name || !text || !settings) throw new Error('The header is not drawn')
        expect(text.height).toBeLessThan(20)
        expect(name.x + name.width).toBeLessThanOrEqual(settings.x)
      }).toPass()
    }
    await trendBox.evaluate((el) => {
      el.style.width = ''
    })
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-rename-btn').click()
    await mainPage.getByTestId('trend-name-input').fill('Target')
    await mainPage.getByTestId('trend-name-confirm-btn').click()
    await expect(mainPage.getByTestId('trend-config-btn')).toHaveText('Target')

    // Delete asks first, and Keep it keeps the trend.
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-delete-btn').click()
    await mainPage.getByTestId('trend-delete-cancel-btn').click()
    await expect(mainPage.getByTestId('trend-config-btn')).toHaveText('Target')
    await mainPage.getByTestId('trend-config-btn').click()
    await expect(mainPage.getByTestId('trend-saved-Target')).toBeVisible()
    await mainPage.getByTestId('trend-delete-btn').click()
    await mainPage.getByTestId('trend-delete-confirm-btn').click()
    await expect(mainPage.getByTestId('trend-config-btn')).toHaveText('Trend')
    await mainPage.getByTestId('trend-config-btn').click()
    await expect(mainPage.getByTestId('trend-saved-Target')).toHaveCount(0)
    await mainPage.keyboard.press('Escape')

    await mainPage.getByTestId('trend-range-10m').click()
    await mainPage.getByTestId('trend-chip-remove-holding_registers-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
  })

  test('the trend docks under Monitor and fills its room, as it was left', async ({ mainPage }) => {
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'dock')
    await expect(mainPage.getByTestId('monitor-trend-handle')).toBeVisible()
    await expect(mainPage.getByTestId('trend-mode-float-btn')).toHaveCount(0)
    await expect(mainPage.getByTestId('monitor-trend-0-holding_registers-0')).toBeVisible()
    await expectNewest(mainPage, 'trend-readout-value-0', '100')

    // Filling the room, it hides the grid and what acts on the grid, and
    // Monitor goes on reading.
    await mainPage.getByTestId('trend-mode-fill-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'fill')
    await expect(mainPage.locator('.monitor-grid')).toHaveCount(0)
    for (const hidden of ['monitor-expand-all-btn', 'monitor-collapse-all-btn'])
      await expect(mainPage.getByTestId(hidden)).toHaveCount(0)
    await expectNewest(mainPage, 'trend-readout-value-0', '100')

    // Closed and opened again, it comes back where it was.
    await mainPage.getByTestId('trend-close-btn').click()
    await expect(mainPage.locator('.monitor-grid')).toBeVisible()
    await mainPage.getByTestId('monitor-trend-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'fill')

    await mainPage.getByTestId('trend-mode-dock-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'dock')
    await expect(mainPage.getByTestId('monitor-expand-all-btn')).toBeVisible()
    await mainPage.getByTestId('trend-chip-remove-holding_registers-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
  })

  test('a chip with a long name stays inside the trend, its remove button too', async ({
    mainPage
  }) => {
    const setComment = async (comment: string): Promise<void> => {
      await mainPage.getByTestId('client-view-debug-btn').click()
      const commentCell = mainPage.locator('.MuiDataGrid-row[data-id="0"] [data-field="comment"]')
      await commentCell.dblclick()
      await commentCell.locator('input').fill(comment)
      await mainPage.keyboard.press('Enter')
      await expectCell(mainPage, 0, 'comment', comment)
      await mainPage.getByTestId('client-view-monitor-btn').click()
    }
    await setComment('The setpoint of the second stage, '.repeat(5).trim())
    await mainPage.getByTestId('monitor-trend-0-holding_registers-0').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'dock')

    const panel = await mainPage.getByTestId('trend-panel').boundingBox()
    const remove = await mainPage.getByTestId('trend-chip-remove-holding_registers-0').boundingBox()
    if (!panel || !remove) throw new Error('The trend or its chip is not laid out')
    expect(remove.x + remove.width).toBeLessThanOrEqual(panel.x + panel.width)

    await mainPage.getByTestId('trend-chip-remove-holding_registers-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
    await setComment('setpoint')
  })

  test('a bit logs as a lane under the lines, lit while it is on', async ({ mainPage }) => {
    await mainPage.getByTestId('client-view-debug-btn').click()
    await selectRegisterType(mainPage, 'Coils')
    await mainPage.getByTestId('log-cell-0').click()
    await mainPage.getByTestId('log-mode-poll').click()
    await mainPage.keyboard.press('Escape')
    await mainPage.getByTestId('client-view-monitor-btn').click()

    await mainPage.getByTestId('monitor-trend-0-coils-0').click()
    await expect(mainPage.getByTestId('trend-lanes')).toBeVisible()
    // A bit alone draws no plot, and the lanes take the cursor.
    const plotBox = await mainPage.locator('[data-testid="trend-lanes"] .u-over').boundingBox()
    if (!plotBox) throw new Error('The trend has no plot to hover')
    await mainPage.mouse.move(plotBox.x + plotBox.width - 2, plotBox.y + plotBox.height / 2)
    // Two pixels from the live edge of ten minutes is seconds before the coil's
    // first sample, so the readout reads – until the trend moves past it.
    await expect(mainPage.locator('[data-testid^="trend-readout-lane-"]')).toHaveText('on', {
      timeout: 15_000
    })
    await mainPage.mouse.move(plotBox.x - 40, plotBox.y - 40)

    // Taken out of the trend and back out of the log, so the rest of the spec
    // logs the setpoint alone, and the log holds it alone from here.
    await mainPage.getByTestId('trend-chip-remove-coils-0').click()
    await mainPage.getByTestId('trend-close-btn').click()
    await expect(mainPage.getByTestId('trend-panel')).toHaveCount(0)
    await mainPage.getByTestId('client-view-debug-btn').click()
    await mainPage.getByTestId('log-cell-0').click()
    await mainPage.getByTestId('log-mode-off').click()
    await mainPage.keyboard.press('Escape')
    await selectRegisterType(mainPage, 'Holding Registers')
    await mainPage.getByTestId('client-view-monitor-btn').click()
    await mainPage.getByTestId('log-btn').click()
    await mainPage.getByTestId('log-clear-btn').click()
    // The poll goes on filling it, which the tests after this one count on.
    await expect(mainPage.getByTestId('log-status-samples')).not.toHaveText(/^0 of/)
    await mainPage.keyboard.press('Escape')
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
