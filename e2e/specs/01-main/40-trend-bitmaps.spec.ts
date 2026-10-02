import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  navigateToServer,
  connectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-trend.json')
// Holding register 0 logs as a line, 6 and 7 as bitmaps of sixteen named bits.
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-trend-bitmaps.json')

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Bitmaps in the trend', () => {
  test('a client logging a line and two bitmaps', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await navigateToClient(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await mainPage.getByTestId('client-view-monitor-btn').click()
    await mainPage.getByTestId('log-btn').click()
    // resetApp leaves main's log alone, and over a spec's samples it offers Start new.
    await mainPage
      .getByTestId('log-turn-on-btn')
      .or(mainPage.getByTestId('log-start-new-btn'))
      .click()
    await mainPage.keyboard.press('Escape')
    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('poll-btn')).toHaveText('Logging')
  })

  test('two opened bitmaps leave the chart its minimum, and scroll under it', async ({
    mainPage
  }) => {
    for (const address of [0, 6, 7])
      await mainPage.getByTestId(`monitor-trend-0-holding_registers-${address}`).click()
    for (const address of [6, 7])
      await mainPage.getByTestId(`trend-lane-toggle-holding_registers-${address}`).click()
    await expect(mainPage.getByTestId('trend-lane-toggle-holding_registers-7')).toHaveAttribute(
      'aria-expanded',
      'true'
    )

    // The chart's minimum is 120 px with 8 px of padding under it, so the chart
    // measures 112; with no minimum it measured 48 here.
    await expect(async () => {
      const chart = await mainPage.getByTestId('trend-chart').boundingBox()
      expect(chart?.height).toBeGreaterThanOrEqual(112)
    }).toPass()
    const lanes = mainPage.getByTestId('trend-lanes')
    const shown = await lanes.locator('..').boundingBox()
    const whole = await lanes.boundingBox()
    expect(shown?.height).toBeGreaterThanOrEqual(22)
    expect(whole?.height).toBeGreaterThan(shown?.height ?? Number.POSITIVE_INFINITY)
  })

  test('a trend too short for its chart and lanes still shows one whole lane', async ({
    mainPage
  }) => {
    await mainPage.evaluate(() => {
      const paper = document
        .querySelector('[data-testid="trend-panel"]')
        ?.closest<HTMLElement>('.MuiPaper-root')
      if (paper) paper.style.height = '260px'
    })

    // A lane is 22 px, under 4 px of the scroll box's padding.
    await expect(async () => {
      const shown = await mainPage.getByTestId('trend-lanes').locator('..').boundingBox()
      expect(shown?.height).toBe(26)
    }).toPass()
  })
})
