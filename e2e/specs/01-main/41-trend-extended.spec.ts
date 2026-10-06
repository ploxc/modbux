import type { Locator, Page } from '@playwright/test'
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
// Holding register 0 is in V, 1 and 2 in A, and coil 0 is a bit that stays on.
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-trend.json')

/** A box's height, measured. */
const heightOf = async (locator: Locator): Promise<number> => {
  const box = await locator.boundingBox()
  if (!box) throw new Error('The box is not laid out')
  return box.height
}

/** Drags a plot's grip by `by` pixels, down for a positive number. */
const dragGrip = async (mainPage: Page, index: number, by: number): Promise<void> => {
  const grip = await mainPage.getByTestId(`trend-plot-grip-${index}`).boundingBox()
  if (!grip) throw new Error('The grip is not laid out')
  const x = grip.x + grip.width / 2
  const y = grip.y + grip.height / 2
  await mainPage.mouse.move(x, y)
  await mainPage.mouse.down()
  await mainPage.mouse.move(x, y + by, { steps: 5 })
  await mainPage.mouse.up()
}

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('The trend, extended', () => {
  test('a client logging registers of two engineering units', async ({ mainPage }) => {
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

  test('two engineering units draw two plots, each with one axis', async ({ mainPage }) => {
    for (const address of [0, 1, 2])
      await mainPage.getByTestId(`monitor-trend-0-holding_registers-${address}`).click()

    await expect(mainPage.getByTestId('trend-plot-0')).toHaveAttribute('data-unit', 'V')
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveAttribute('data-unit', 'A')
    await expect(mainPage.getByTestId('trend-plot-2')).toHaveCount(0)
    // The plot's own axis, and none for time: the strip under the plots draws that.
    await expect(mainPage.locator('[data-testid="trend-plot-1"] .u-axis')).toHaveCount(1)
    await expect(mainPage.getByTestId('trend-time-axis')).toBeVisible()

    // The cursor over one plot reads every line of every plot, in plot order.
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await expect(async () => {
      await mainPage.mouse.move(over.x - 40, over.y - 40)
      await mainPage.mouse.move(over.x + over.width - 2, over.y + over.height / 2)
      await expect(mainPage.getByTestId('trend-readout-value-0')).toHaveText(/ V$/, {
        timeout: 1000
      })
      await expect(mainPage.getByTestId('trend-readout-value-2')).toHaveText(/ A$/, {
        timeout: 1000
      })
    }).toPass()
    await mainPage.mouse.move(over.x - 40, over.y - 40)
  })

  test("a grip drags its plot's height, and the plots scroll once they outgrow the room", async ({
    mainPage
  }) => {
    const first = mainPage.getByTestId('trend-plot-0')
    const second = mainPage.getByTestId('trend-plot-1')
    const plots = mainPage.getByTestId('trend-plots')
    const before = await heightOf(first)
    const other = await heightOf(second)

    // Not under the shortest a plot gets, and a double click hands it back its share.
    await dragGrip(mainPage, 1, -400)
    await expect(async () => expect(await heightOf(second)).toBe(120)).toPass()
    await mainPage.getByTestId('trend-plot-grip-1').dblclick()
    await expect(async () => expect(await heightOf(second)).toBe(other)).toPass()

    await dragGrip(mainPage, 0, 200)
    await expect(async () => expect(await heightOf(first)).toBeCloseTo(before + 200, 0)).toPass()
    expect(await heightOf(second)).toBe(other)
    const overflow = await plots.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(overflow).toBeGreaterThan(0)

    await mainPage.getByTestId('trend-plot-grip-0').dblclick()
    await expect(async () => expect(await heightOf(first)).toBe(before)).toPass()
    expect(await heightOf(second)).toBe(other)
  })

  test('a saved trend keeps the height of its plots', async ({ mainPage }) => {
    const first = mainPage.getByTestId('trend-plot-0')
    const before = await heightOf(first)
    await dragGrip(mainPage, 0, 60)
    await expect(async () => expect(await heightOf(first)).toBeCloseTo(before + 60, 0)).toPass()
    const held = await heightOf(first)

    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-save-as-btn').click()
    await mainPage.getByTestId('trend-name-input').fill('Heights')
    await mainPage.getByTestId('trend-name-confirm-btn').click()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-new-btn').click()
    await expect(first).toHaveCount(0)
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-saved-Heights').click()

    await expect(async () => expect(await heightOf(first)).toBe(held)).toPass()
    await mainPage.getByTestId('trend-plot-grip-0').dblclick()
    await expect(mainPage.getByTestId('trend-changed')).toBeVisible()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-save-btn').click()
    await expect(mainPage.getByTestId('trend-changed')).toHaveCount(0)
  })

  test("a click on a chip hides its register's line, and a second shows it", async ({
    mainPage
  }) => {
    const voltage = mainPage.getByTestId('trend-chip-toggle-holding_registers-0')
    await voltage.click()
    await expect(voltage).toHaveAttribute('aria-pressed', 'false')
    await expect(mainPage.getByTestId('trend-chip-holding_registers-0')).toHaveAttribute(
      'data-hidden',
      'true'
    )
    // The volts' only line hidden, their plot goes, and hiding changes the trend.
    await expect(mainPage.getByTestId('trend-plot-0')).toHaveAttribute('data-unit', 'A')
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveCount(0)
    await expect(mainPage.getByTestId('trend-changed')).toBeVisible()

    await voltage.click()
    await expect(voltage).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-plot-0')).toHaveAttribute('data-unit', 'V')
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveAttribute('data-unit', 'A')
  })

  test('a double click shows one register alone, and again shows them all', async ({
    mainPage
  }) => {
    const current = mainPage.getByTestId('trend-chip-toggle-holding_registers-1')
    await current.dblclick()
    await expect(mainPage.getByTestId('trend-plot-0')).toHaveAttribute('data-unit', 'A')
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveCount(0)
    for (const address of [0, 2])
      await expect(
        mainPage.getByTestId(`trend-chip-toggle-holding_registers-${address}`)
      ).toHaveAttribute('aria-pressed', 'false')

    // A hidden line is not in the readout: one row, the shown line's.
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(over.x + over.width - 2, over.y + over.height / 2)
    await expect(mainPage.getByTestId('trend-readout-value-0')).toHaveText(/ A$/)
    await expect(mainPage.getByTestId('trend-readout-value-1')).toHaveCount(0)
    await mainPage.mouse.move(over.x - 40, over.y - 40)

    await current.dblclick()
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveAttribute('data-unit', 'A')
    for (const address of [0, 1, 2])
      await expect(
        mainPage.getByTestId(`trend-chip-toggle-holding_registers-${address}`)
      ).toHaveAttribute('aria-pressed', 'true')
  })

  test("a hidden bit's lane is gone", async ({ mainPage }) => {
    await mainPage.getByTestId('monitor-trend-0-coils-0').click()
    await expect(mainPage.getByTestId('trend-lanes')).toBeVisible()

    await mainPage.getByTestId('trend-chip-toggle-coils-0').click()
    await expect(mainPage.getByTestId('trend-lanes')).toHaveCount(0)
    await mainPage.getByTestId('trend-chip-toggle-coils-0').click()
    await expect(mainPage.getByTestId('trend-lanes')).toBeVisible()
    await mainPage.getByTestId('trend-chip-remove-coils-0').click()
  })

  test('a saved trend keeps what it hides', async ({ mainPage }) => {
    await mainPage.getByTestId('trend-chip-toggle-holding_registers-2').click()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-save-btn').click()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-new-btn').click()
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-saved-Heights').click()

    await expect(mainPage.getByTestId('trend-chip-holding_registers-2')).toHaveAttribute(
      'data-hidden',
      'true'
    )
    await mainPage.getByTestId('trend-chip-toggle-holding_registers-2').click()
  })
})
