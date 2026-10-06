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
import type { ElectronApplication } from '@playwright/test'
import { evaluateMain } from '../../fixtures/launch'

/** The window's size, which the suite's other specs start from. */
const DEFAULT_SIZE: [number, number] = [1480, 1000]

const setWindowSize = (app: ElectronApplication, width: number, height: number): Promise<void> =>
  evaluateMain(() =>
    app.evaluate(
      ({ BrowserWindow }, [w, h]) => {
        const [window] = BrowserWindow.getAllWindows()
        if (!window) throw new Error('no window to resize')
        window.setSize(w, h)
      },
      [width, height] as [number, number]
    )
  )

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

  test('two opened bitmaps make the plots scroll, and the plot keeps its minimum', async ({
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

    await expect(async () => {
      const plot = await mainPage.getByTestId('trend-plot-0').boundingBox()
      expect(plot?.height).toBeGreaterThanOrEqual(120)
      const overflow = await mainPage
        .getByTestId('trend-plots')
        .evaluate((el) => el.scrollHeight - el.clientHeight)
      expect(overflow).toBeGreaterThan(0)
    }).toPass()
  })

  test('a trend too short for its plot and lanes keeps the plot at its minimum', async ({
    mainPage
  }) => {
    await mainPage
      .getByTestId('trend-panel')
      .locator('xpath=..')
      .evaluate((el) => {
        el.style.height = '260px'
      })

    await expect(async () => {
      const plot = await mainPage.getByTestId('trend-plot-0').boundingBox()
      const plots = await mainPage.getByTestId('trend-plots').boundingBox()
      expect(plot?.height).toBe(120)
      expect(plots?.height).toBeLessThan(120)
    }).toPass()
  })

  test('opened bitmaps stay open as the trend fills and docks again', async ({ mainPage }) => {
    const toggle = (address: number): ReturnType<typeof mainPage.getByTestId> =>
      mainPage.getByTestId(`trend-lane-toggle-holding_registers-${address}`)
    await toggle(6).click()
    await expect(toggle(6)).toHaveAttribute('aria-expanded', 'false')

    for (const mode of ['fill', 'dock']) {
      await mainPage.getByTestId(`trend-mode-${mode}-btn`).click()
      await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', mode)
      await expect(toggle(6)).toHaveAttribute('aria-expanded', 'false')
      await expect(toggle(7)).toHaveAttribute('aria-expanded', 'true')
    }
  })

  test('the docked trend narrows with the window again', async ({ mainPage, electronApp }) => {
    await expect(mainPage.getByTestId('trend-panel')).toHaveAttribute('data-mode', 'dock')
    await setWindowSize(electronApp, 1900, DEFAULT_SIZE[1])
    await setWindowSize(electronApp, 1200, DEFAULT_SIZE[1])

    // No wider than the panel around it, which narrowed with the window.
    await expect(async () => {
      const plot = await mainPage.getByTestId('trend-plot-0').boundingBox()
      const panel = await mainPage.getByTestId('trend-panel').boundingBox()
      expect(plot?.width).toBeLessThanOrEqual(panel?.width ?? 0)
    }).toPass()
    await setWindowSize(electronApp, ...DEFAULT_SIZE)
  })

  test('Axes and lines moves back inside a window that shrinks under it', async ({
    mainPage,
    electronApp
  }) => {
    await mainPage.getByTestId('trend-settings-btn').click()
    const panel = mainPage.getByRole('region', { name: 'Axes and lines' })
    await expect(panel).toBeVisible()

    await setWindowSize(electronApp, 1000, 800)
    await expect(async () => {
      const { right, bottom, width, height } = await panel.evaluate((el) => ({
        ...el.getBoundingClientRect().toJSON(),
        width: window.innerWidth,
        height: window.innerHeight
      }))
      expect(right).toBeLessThanOrEqual(width)
      expect(bottom).toBeLessThanOrEqual(height)
    }).toPass()
    await mainPage.getByTestId('trend-settings-btn').click()
    await setWindowSize(electronApp, ...DEFAULT_SIZE)
  })

  test('Axes and lines grows and shrinks with a line taken out and added while it is open', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('trend-settings-btn').click()
    const panel = mainPage.getByRole('region', { name: 'Axes and lines' })
    await expect(panel).toBeVisible()
    // A press measures the paper, which once fixed its height.
    await panel.click({ position: { x: 4, y: 4 } })
    const height = async (): Promise<number> => (await panel.boundingBox())?.height ?? 0
    const opened = await height()

    const line = mainPage.getByTestId('monitor-trend-0-holding_registers-0')
    await line.click()
    await expect(async () => expect(await height()).toBeLessThan(opened)).toPass()
    await line.click()
    await expect(async () => expect(await height()).toBe(opened)).toPass()
    await mainPage.getByTestId('trend-settings-btn').click()
  })
})
