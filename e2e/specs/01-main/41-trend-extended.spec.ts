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
import { tmpdir } from 'os'
import { readFile } from 'fs/promises'
import { evaluateMain } from '../../fixtures/launch'

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

/** A pinch's step at the pointer: the wheel with Control held, as Chromium hands a pinch over. */
const pinch = async (mainPage: Page): Promise<void> => {
  await mainPage.keyboard.down('Control')
  await mainPage.mouse.wheel(0, -100)
  await mainPage.keyboard.up('Control')
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
    // resetApp leaves main's log alone: over a spec's samples it offers Start
    // new, and a spec before this one can leave it logging.
    const turnOn = mainPage
      .getByTestId('log-turn-on-btn')
      .or(mainPage.getByTestId('log-start-new-btn'))
    await expect(turnOn.or(mainPage.getByTestId('log-turn-off-btn'))).toBeVisible()
    if (await turnOn.isVisible()) await turnOn.click()
    await mainPage.keyboard.press('Escape')
    const poll = mainPage.getByTestId('poll-btn')
    await expect(poll).toHaveText(/^Log/)
    if ((await poll.textContent()) === 'Log') await poll.click()
    await expect(poll).toHaveText('Logging')
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
    // Axes and lines holds an axis for each unit shown, and every line.
    await mainPage.getByTestId('trend-settings-btn').click()
    await expect(mainPage.getByTestId('trend-axis-0-unit')).toHaveText('A')
    await expect(mainPage.getByTestId('trend-axis-1-unit')).toHaveCount(0)
    await expect(mainPage.getByTestId('trend-line-holding_registers-0-color')).toBeVisible()
    await mainPage.getByTestId('trend-settings-btn').click()

    await voltage.click()
    await expect(voltage).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-plot-0')).toHaveAttribute('data-unit', 'V')
    await expect(mainPage.getByTestId('trend-plot-1')).toHaveAttribute('data-unit', 'A')
  })

  test('Alt and a click show one register alone, and again show them all', async ({ mainPage }) => {
    const current = mainPage.getByTestId('trend-chip-toggle-holding_registers-1')
    await current.click({ modifiers: ['Alt'] })
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

    await current.click({ modifiers: ['Alt'] })
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

  test('a drag across a plot selects a stretch, and the panel reads it from the log', async ({
    mainPage
  }) => {
    // Holding register 8 is the server's static 230 V. Filling the room, the
    // trend leaves the plots room beside the panel.
    await mainPage.getByTestId('monitor-trend-0-holding_registers-8').click()
    await mainPage.getByTestId('trend-mode-fill-btn').click()
    await mainPage.getByTestId('trend-range-log').click()
    // A stretch of a log seconds old can fall between two polls.
    const navigator = mainPage.getByTestId('trend-navigator-window')
    await expect(async () => {
      const start = Number(await navigator.getAttribute('aria-valuemin'))
      const end = Number(await navigator.getAttribute('aria-valuemax'))
      expect(end - start).toBeGreaterThan(10_000)
    }).toPass({ timeout: 20_000 })
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(over.x + over.width * 0.2, over.y + over.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(over.x + over.width * 0.8, over.y + over.height / 2, { steps: 5 })
    // The box shows as it is dragged, in the other plot too.
    const dragged = await mainPage.locator('[data-testid="trend-plot-1"] .u-select').boundingBox()
    expect(dragged?.width).toBeGreaterThan(over.width * 0.5)
    await mainPage.mouse.up()

    // A drag no longer zooms: the trend goes on following the log.
    await expect(mainPage.getByTestId('trend-selection')).toBeVisible()
    await expect(mainPage.getByTestId('trend-live-btn')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.locator('[data-testid^="trend-selection-row-"]')).toHaveCount(4)
    const setpoint = mainPage.getByTestId('trend-selection-row-holding_registers-8')
    await expect(setpoint.locator('[data-field="avg"]')).toHaveText('230 V')
    await expect(setpoint.locator('[data-field="min"]')).toHaveText('230')
    await expect(setpoint.locator('[data-field="max"]')).toHaveText('230')
    await expect(setpoint.locator('[data-field="delta"]')).toHaveText('0')
    expect(Number(await setpoint.locator('[data-field="n"]').textContent())).toBeGreaterThan(0)

    // Zoom to range holds the trend still on the stretch, and the stretch stays selected.
    const stretch = await mainPage.getByTestId('trend-selection-stretch').textContent()
    await mainPage.getByTestId('trend-selection-zoom-btn').click()
    await expect(mainPage.getByTestId('trend-paused-btn')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-selection-stretch')).toHaveText(stretch ?? '')

    await mainPage.getByTestId('trend-selection-clear-btn').click()
    await expect(mainPage.getByTestId('trend-selection')).toHaveCount(0)
  })

  test('a click on a plot clears the stretch, and so does Live', async ({ mainPage }) => {
    const plot = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
    // The panel takes its room from the plots, so the plot is measured again after it shows.
    const boxOf = async (): Promise<{ x: number; y: number; width: number; height: number }> => {
      const box = await plot.boundingBox()
      if (!box) throw new Error('The plot is not laid out')
      return box
    }
    const select = async (): Promise<void> => {
      const over = await boxOf()
      await mainPage.mouse.move(over.x + over.width * 0.1, over.y + over.height / 2)
      await mainPage.mouse.down()
      await mainPage.mouse.move(over.x + over.width * 0.8, over.y + over.height / 2, { steps: 5 })
      await mainPage.mouse.up()
      await expect(mainPage.getByTestId('trend-selection')).toBeVisible()
    }
    await select()
    await expect(
      mainPage.getByTestId('trend-selection-row-holding_registers-8').locator('[data-field="min"]')
    ).toHaveText('230')
    const over = await boxOf()
    await mainPage.mouse.click(over.x + over.width * 0.9, over.y + over.height / 2)
    await expect(mainPage.getByTestId('trend-selection')).toHaveCount(0)

    await select()
    await mainPage.getByTestId('trend-live-btn').click()
    await expect(mainPage.getByTestId('trend-selection')).toHaveCount(0)
    await mainPage.getByTestId('trend-range-10m').click()
    await mainPage.getByTestId('trend-mode-dock-btn').click()
  })

  test("the wheel over a plot's axis zooms it, Fixed takes the zoom, and its reset hands it back", async ({
    mainPage
  }) => {
    await mainPage.getByTestId('trend-mode-fill-btn').click()
    const fixedRange = async (): Promise<number> => {
      await mainPage.getByTestId('trend-axis-0-fixed').click()
      const min = Number(await mainPage.getByTestId('trend-axis-0-min').inputValue())
      const max = Number(await mainPage.getByTestId('trend-axis-0-max').inputValue())
      return max - min
    }
    await mainPage.getByTestId('trend-settings-btn').click()
    const unzoomed = await fixedRange()
    await mainPage.getByTestId('trend-axis-0-auto').click()

    const axis = await mainPage.getByTestId('trend-plot-axis-0').boundingBox()
    if (!axis) throw new Error('The axis is not laid out')
    await mainPage.mouse.move(axis.x + axis.width / 2, axis.y + axis.height / 2)
    await mainPage.mouse.wheel(0, -100)
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveText('Auto')
    expect(await fixedRange()).toBeLessThan(unzoomed)
    // Fixed takes over from the zoom; a zoom of the fixed axis goes back to Fixed.
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveCount(0)
    await mainPage.mouse.move(axis.x + axis.width / 2, axis.y + axis.height / 2)
    await mainPage.mouse.wheel(0, 100)
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveText('Fixed')
    await mainPage.getByTestId('trend-plot-reset-0').click()
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveCount(0)
    await mainPage.getByTestId('trend-axis-0-auto').click()

    // A double click on a zoomed axis hands it back too, and leaves no step back
    // on an axis that was not zoomed.
    await mainPage.mouse.move(axis.x + axis.width / 2, axis.y + axis.height / 2)
    await mainPage.mouse.wheel(0, -100)
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveText('Auto')
    await mainPage.mouse.dblclick(axis.x + axis.width / 2, axis.y + axis.height / 2)
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveCount(0)
    const steps = await mainPage.getByTestId('trend-back-btn').getAttribute('title')
    // Further apart than a run of zooms, so it would be a step of its own.
    await mainPage.waitForTimeout(700)
    await mainPage.mouse.dblclick(axis.x + axis.width / 2, axis.y + axis.height / 2)
    await expect(mainPage.getByTestId('trend-plot-reset-0')).toHaveCount(0)
    expect(await mainPage.getByTestId('trend-back-btn').getAttribute('title')).toBe(steps)
    await mainPage.getByTestId('trend-settings-btn').click()
  })

  test('each zoom is a step back, Backspace takes them back, and the arrow goes with the last', async ({
    mainPage
  }) => {
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    const stretch = mainPage.getByTestId('trend-navigator-window')
    // Over the whole log, a zoom at the middle ends before the log does, so it
    // holds still. A press on the plot takes the focus for the keys, and zooms nothing.
    await mainPage.getByTestId('trend-range-log').click()
    await mainPage.mouse.click(over.x + over.width * 0.5, over.y + over.height / 2)
    await pinch(mainPage)
    await expect(mainPage.getByTestId('trend-paused-btn')).toHaveAttribute('aria-pressed', 'true')
    const once = await stretch.getAttribute('aria-valuetext')
    // Further apart than a run of zooms, so a step of its own.
    await mainPage.waitForTimeout(700)
    await pinch(mainPage)
    await expect(stretch).not.toHaveAttribute('aria-valuetext', once ?? '')
    await expect(mainPage.getByTestId('trend-back-btn')).toHaveAttribute(
      'title',
      `Back to ${once?.replace(' to ', ' → ')}`
    )

    await mainPage.keyboard.press('Backspace')
    await expect(stretch).toHaveAttribute('aria-valuetext', once ?? '')
    await mainPage.keyboard.press('Backspace')
    await expect(mainPage.getByTestId('trend-live-btn')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-back-btn')).toHaveCount(0)
  })

  test('a shift-drag pans, and a pinch zooms the time and not the page', async ({ mainPage }) => {
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    const stretch = mainPage.getByTestId('trend-navigator-window')
    const middle = { x: over.x + over.width / 2, y: over.y + over.height / 2 }
    await mainPage.mouse.move(middle.x, middle.y)
    await pinch(mainPage)
    await pinch(mainPage)
    const zoomed = await stretch.getAttribute('aria-valuenow')

    // A sideways swipe pans nothing: the navigator pans.
    await mainPage.mouse.wheel(-200, 0)
    await mainPage.waitForTimeout(300)
    await expect(stretch).toHaveAttribute('aria-valuenow', zoomed ?? '')

    await mainPage.keyboard.down('Shift')
    await mainPage.mouse.down()
    await mainPage.mouse.move(middle.x - 150, middle.y, { steps: 5 })
    await mainPage.mouse.up()
    await mainPage.keyboard.up('Shift')
    await expect(stretch).not.toHaveAttribute('aria-valuenow', zoomed ?? '')
    await expect(mainPage.getByTestId('trend-selection')).toHaveCount(0)

    const width = await mainPage.evaluate(() => window.innerWidth)
    const before = (await stretch.boundingBox())?.width ?? 0
    await mainPage.keyboard.down('Control')
    await mainPage.mouse.wheel(0, -40)
    await mainPage.keyboard.up('Control')
    await expect(async () =>
      expect((await stretch.boundingBox())?.width ?? 0).toBeLessThan(before)
    ).toPass()
    expect(await mainPage.evaluate(() => window.innerWidth)).toBe(width)
  })

  test('a pinch zooms in on a range longer than the log', async ({ mainPage }) => {
    // Ten minutes of a log younger than that: the navigator's window spans the strip.
    await mainPage.getByTestId('trend-range-10m').click()
    const stretch = mainPage.getByTestId('trend-navigator-window')
    const strip = await mainPage.getByTestId('trend-navigator').boundingBox()
    if (!strip) throw new Error('The navigator is not laid out')
    await expect(async () =>
      expect((await stretch.boundingBox())?.width ?? 0).toBeGreaterThan(strip.width - 4)
    ).toPass()

    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(over.x + over.width * 0.95, over.y + over.height / 2)
    await pinch(mainPage)
    await expect(async () =>
      expect((await stretch.boundingBox())?.width ?? 0).toBeLessThan(strip.width * 0.9)
    ).toPass()
  })

  test('the wheel over a plot scrolls the plots, and zooms nothing', async ({ mainPage }) => {
    await mainPage.getByTestId('trend-range-10m').click()
    await dragGrip(mainPage, 0, 600)
    const plots = mainPage.getByTestId('trend-plots')
    await expect(async () =>
      expect(await plots.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    ).toPass()
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(over.x + over.width / 2, over.y + 40)
    await mainPage.mouse.wheel(0, 200)

    await expect(async () =>
      expect(await plots.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    ).toPass()
    await expect(mainPage.getByTestId('trend-range-10m')).toHaveAttribute('aria-pressed', 'true')
    await expect(mainPage.getByTestId('trend-live-btn')).toHaveAttribute('aria-pressed', 'true')
    await plots.evaluate((el) => el.scrollTo({ top: 0 }))
    await mainPage.getByTestId('trend-plot-grip-0').dblclick()
  })

  test('+ and − zoom nothing, and Esc lets the stretch go and then follows the log', async ({
    mainPage
  }) => {
    const plot = mainPage.locator('[data-testid="trend-plot-0"] .u-over')
    const over = await plot.boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    const stretch = mainPage.getByTestId('trend-navigator-window')
    // Zoomed in on the whole log first, so it holds still. A press on the plot
    // takes the focus for the keys.
    await mainPage.getByTestId('trend-range-log').click()
    await mainPage.mouse.click(over.x + over.width / 2, over.y + over.height / 2)
    await pinch(mainPage)
    await expect(mainPage.getByTestId('trend-paused-btn')).toHaveAttribute('aria-pressed', 'true')
    const held = await stretch.getAttribute('aria-valuetext')
    for (const key of ['+', '-', 'ArrowLeft', 'ArrowRight']) await mainPage.keyboard.press(key)
    await mainPage.waitForTimeout(300)
    await expect(stretch).toHaveAttribute('aria-valuetext', held ?? '')

    const box = await plot.boundingBox()
    if (!box) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    await expect(mainPage.getByTestId('trend-selection')).toBeVisible()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('trend-selection')).toHaveCount(0)
    await expect(mainPage.getByTestId('trend-paused-btn')).toHaveAttribute('aria-pressed', 'true')
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('trend-live-btn')).toHaveAttribute('aria-pressed', 'true')
  })

  test('the ? lists the gestures and the keys', async ({ mainPage }) => {
    await mainPage.getByTestId('trend-help-btn').hover()
    await expect(mainPage.getByTestId('trend-help')).toContainText('Shift + drag')
    await expect(mainPage.getByTestId('trend-help')).toContainText('Esc')
    await expect(mainPage.getByTestId('trend-help')).toContainText('Alt + click a chip')
    await expect(mainPage.getByTestId('trend-help')).toContainText('Double click an axis')
    await expect(mainPage.getByTestId('trend-help')).not.toContainText('+ and')
    await expect(mainPage.getByTestId('trend-help')).not.toContainText('sideways')
    await mainPage.mouse.move(0, 0)
    await mainPage.getByTestId('trend-mode-dock-btn').click()
  })

  test('the header and the selection hand over a CSV of the registers shown', async ({
    electronApp,
    mainPage
  }) => {
    /** The lines of the CSV a press hands over, read off the file it writes. */
    const download = async (press: () => Promise<void>): Promise<string[]> => {
      const savePath = resolve(tmpdir(), `modbux-trend-export-${Date.now()}.csv`)
      await evaluateMain(() =>
        electronApp.evaluate(({ session }, path) => {
          session.defaultSession.once('will-download', (_event, item) => {
            item.setSavePath(path)
          })
        }, savePath)
      )
      await press()
      // The file exists before the download has written into it.
      let csv = ''
      await expect(async () => {
        csv = await readFile(savePath, 'utf-8')
        expect(csv).toMatch(/\n.*\n.*\n/)
      }).toPass()
      return csv.split('\n')
    }
    const expectRegisters = (lines: string[]): void => {
      expect(lines[0]).toMatch(/^# Modbux log of /)
      expect(lines[1]).toContain('; the trend from ')
      expect(lines[2]).toBe('time,0 Voltage L1 (V),1 Current L1 (A),8 Voltage setpoint (V)')
      expect(lines[3]).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3},/)
      expect(lines.slice(3).some((line) => line.endsWith(',230'))).toBe(true)
    }

    // A hidden register has no column.
    await mainPage.getByTestId('trend-chip-toggle-holding_registers-2').click()
    expectRegisters(await download(() => mainPage.getByTestId('trend-csv-btn').click()))

    await mainPage.getByTestId('trend-range-log').click()
    const over = await mainPage.locator('[data-testid="trend-plot-0"] .u-over').boundingBox()
    if (!over) throw new Error('The plot is not laid out')
    await mainPage.mouse.move(over.x + over.width * 0.1, over.y + over.height / 2)
    await mainPage.mouse.down()
    await mainPage.mouse.move(over.x + over.width * 0.9, over.y + over.height / 2, { steps: 5 })
    await mainPage.mouse.up()
    expectRegisters(await download(() => mainPage.getByTestId('trend-selection-csv-btn').click()))

    await mainPage.getByTestId('trend-selection-clear-btn').click()
    await mainPage.getByTestId('trend-chip-toggle-holding_registers-2').click()
    await mainPage.getByTestId('trend-range-10m').click()
  })

  test('Save as image hands over the whole trend as a PNG, and Copy as image puts it on the clipboard', async ({
    electronApp,
    mainPage
  }) => {
    /** The height of the PNG a press of Save as image hands over, read off its header. */
    const savedHeight = async (): Promise<number> => {
      const savePath = resolve(tmpdir(), `modbux-trend-image-${Date.now()}.png`)
      await evaluateMain(() =>
        electronApp.evaluate(({ session }, path) => {
          session.defaultSession.once('will-download', (_event, item) => {
            item.setSavePath(path)
          })
        }, savePath)
      )
      await mainPage.getByTestId('trend-config-btn').click()
      await mainPage.getByTestId('trend-save-image-btn').click()
      let png = Buffer.alloc(0)
      await expect(async () => {
        png = await readFile(savePath)
        expect(png.length).toBeGreaterThan(24)
      }).toPass()
      expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      // The header's height, after its width, as a 32-bit big-endian number.
      return png.readUInt32BE(20)
    }

    // Holding register 6 is a bitmap of named bits.
    await mainPage.getByTestId('monitor-trend-0-holding_registers-6').click()
    await expect(mainPage.getByTestId('trend-lanes')).toBeVisible()
    const shut = await savedHeight()
    await mainPage.getByTestId('trend-lane-toggle-holding_registers-6').click()
    await expect(
      mainPage.locator('[data-testid^="trend-lane-"][data-testid*="|"]').first()
    ).toBeVisible()
    expect(await savedHeight()).toBeGreaterThan(shut)

    await evaluateMain(() => electronApp.evaluate(({ clipboard }) => clipboard.clear()))
    await mainPage.getByTestId('trend-config-btn').click()
    await mainPage.getByTestId('trend-copy-image-btn').click()
    await expect(async () => {
      const empty = await evaluateMain(() =>
        electronApp.evaluate(({ clipboard }) => clipboard.readImage().isEmpty())
      )
      expect(empty).toBe(false)
    }).toPass()

    await mainPage.getByTestId('trend-chip-remove-holding_registers-6').click()
  })
})
