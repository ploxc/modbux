/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MODBUX — Feature Tour                                                  ║
 * ║                                                                         ║
 * ║  A cinematic walkthrough of every major feature.                        ║
 * ║  Scenario: commissioning a Solar Edge 10K inverter.                     ║
 * ║  We build a simulator, connect a client, monitor live data,             ║
 * ║  inspect alarms, write back, and run everything side-by-side.           ║
 * ║                                                                         ║
 * ║  Run:  yarn presentation                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import { test, expect } from '../../fixtures/presentation-app'
import {
  navigateToServer,
  navigateToClient,
  navigateToHome,
  loadServerConfig,
  loadClientConfig,
  expandAllServerPanels,
  setServerPanelCollapsed,
  connectClient,
  disconnectClient,
  readRegisters,
  clearData,
  selectRegisterType,
  selectUnitId,
  selectDataType,
  enableReadConfiguration,
  disableReadConfiguration,
  writeRegister,
  cell,
  disableClientRawMode
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { readFileSync } from 'fs'
import { Locator, type Page } from '@playwright/test'

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHOTS = resolve(__dirname, '../../presentation-output/screenshots')
const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')

const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-presentation.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-presentation.json')

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Small pause to let animations finish and state settle before a screenshot */
const beat = (page: Page, ms = 600): Promise<void> => page.waitForTimeout(ms)

/** Take a named screenshot */
const snap = async (page: Page, name: string): Promise<Buffer> => {
  await page.mouse.move(0, 0)
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur())
  await page.waitForTimeout(100)

  return await page.screenshot({ path: resolve(SHOTS, `${name}.png`) })
}

/** Locate the nearest MUI Paper ancestor of a test-id element */
const paperOf = (page: Page, testId: string): Locator =>
  page.getByTestId(testId).locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")]').first()

// ═══════════════════════════════════════════════════════════════════════════
//  ACT I — THE STAGE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act I — The Stage', () => {
  test('scene 1 — home screen', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    // Read real app version from package.json (app.getVersion() returns Electron version in test mode)
    const appVersion = JSON.parse(
      readFileSync(resolve(__dirname, '../../../package.json'), 'utf-8')
    ).version
    const versionText = mainPage.getByTestId('home-version-link').locator('p').first()
    await versionText.evaluate((el, v) => {
      el.textContent = v
    }, appVersion)
    await expect(versionText).toHaveText(appVersion)
    await beat(mainPage, 800)
    await snap(mainPage, 'home')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT II — BUILDING THE SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act II — Building the Simulator', () => {
  test('scene 2 — load server config', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await beat(mainPage, 3500)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(11)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  test('scene 3 — server overview', async ({ mainPage }) => {
    await expandAllServerPanels(mainPage)
    await beat(mainPage)
    await snap(mainPage, 'server-overview')
  })

  test('scene 3b — server holding registers only', async ({ mainPage }) => {
    await setServerPanelCollapsed(mainPage, 'coils', true)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', true)
    await setServerPanelCollapsed(mainPage, 'input_registers', true)
    await beat(mainPage, 300)
    await snap(mainPage, 'server-holding-registers-only')
    await setServerPanelCollapsed(mainPage, 'coils', false)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', false)
    await setServerPanelCollapsed(mainPage, 'input_registers', false)
    await beat(mainPage, 300)
  })

  test('scene 4 — server coils', async ({ mainPage }) => {
    const coilsPaper = paperOf(mainPage, 'section-coils')
    await coilsPaper.screenshot({ path: resolve(SHOTS, 'server-coils.png') })
  })

  test('scene 5 — server discrete inputs', async ({ mainPage }) => {
    const diPaper = paperOf(mainPage, 'section-discrete_inputs')
    await diPaper.screenshot({ path: resolve(SHOTS, 'server-discrete-inputs.png') })
  })

  test('scene 5b — server holding registers', async ({ mainPage }) => {
    const hrPaper = paperOf(mainPage, 'section-holding_registers')
    await hrPaper.screenshot({ path: resolve(SHOTS, 'server-holding-registers.png') })
  })

  test('scene 5c — server input registers', async ({ mainPage }) => {
    const irPaper = paperOf(mainPage, 'section-input_registers')
    await irPaper.screenshot({ path: resolve(SHOTS, 'server-input-registers.png') })
  })

  test('scene 6 — server bitmap detail', async ({ mainPage }) => {
    // Collapse non-holding panels so bitmap gets space
    await setServerPanelCollapsed(mainPage, 'coils', true)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', true)
    await setServerPanelCollapsed(mainPage, 'input_registers', true)
    await beat(mainPage, 300)

    // Expand bitmap at address 12
    const bitmapExpand = mainPage.getByTestId('server-bitmap-expand-12')
    await expect(bitmapExpand).toBeVisible()
    await bitmapExpand.click()
    await beat(mainPage, 500)

    // Screenshot bitmap detail panel (comments from fixture)
    const bitmapDetail = mainPage.getByTestId('server-bitmap-detail-12')
    await bitmapDetail.screenshot({ path: resolve(SHOTS, 'server-bitmap.png') })

    // Collapse bitmap
    await bitmapExpand.click()
    await beat(mainPage, 300)
  })

  test('scene 6b — unit ID dropdown', async ({ mainPage }) => {
    await mainPage.getByTestId('server-unitid-select').click()
    await beat(mainPage, 300)
    const listbox = mainPage.getByRole('listbox')
    await listbox.screenshot({ path: resolve(SHOTS, 'server-unitid-dropdown.png') })
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 7 — multi-unit (extra servers)', async ({ mainPage }) => {
    await expandAllServerPanels(mainPage)
    await beat(mainPage, 300)

    // Switch to Unit 1 — night-mode inverter
    await selectUnitId(mainPage, '1')
    await beat(mainPage)
    await mainPage.evaluate(() => (document.activeElement as HTMLElement)?.blur())
    await beat(mainPage, 200)

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')

    await snap(mainPage, 'server-unit1')

    // Return to unit 0
    await selectUnitId(mainPage, '0')
    await beat(mainPage, 300)
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Add Register Modal — 6 data-type variants      │
  // └─────────────────────────────────────────────────┘

  test('scene 8 — add register: UINT16 fixed', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'UINT16')
    // Default mode is fixed — no toggle needed
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('100')
    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await expect(valueInput).toBeVisible()
    await valueInput.fill('387')
    const commentInput8 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput8.fill('DC Voltage (V)')
    await commentInput8.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-uint16-fixed.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 9 — add register: FLOAT generator', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'FLOAT')
    await mainPage.getByTestId('add-reg-generator-btn').click()
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('102')
    const minInput = mainPage.getByTestId('add-reg-min-input').locator('input')
    await expect(minInput).toBeVisible()
    await minInput.fill('1.8')
    await mainPage.getByTestId('add-reg-max-input').locator('input').fill('9.7')
    await mainPage.getByTestId('add-reg-interval-input').locator('input').fill('1')
    const commentInput9 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput9.fill('AC Power (kW)')
    await commentInput9.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-float-generator.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 10 — add register: BITMAP fixed', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'BITMAP')
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('104')
    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    await expect(valueInput).toBeVisible()
    await valueInput.fill('21')
    const commentInput10 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput10.fill('System Status')
    await commentInput10.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-bitmap-fixed.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 11 — add register: UTF8 fixed', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'UTF-8')
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('106')
    await mainPage.getByTestId('add-reg-length-input').locator('input').fill('6')
    await mainPage.getByTestId('add-reg-string-input').locator('input').fill('SE-10K')
    const commentInput11 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput11.fill('Model Name')
    await commentInput11.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-utf8-fixed.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 12 — add register: UNIX generator', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'UNIX')
    await mainPage.getByTestId('add-reg-generator-btn').click()
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('110')
    const intervalInput = mainPage.getByTestId('add-reg-interval-input').locator('input')
    await expect(intervalInput).toBeVisible()
    await intervalInput.fill('5')
    const commentInput12 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput12.fill('Last Update')
    await commentInput12.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-unix-generator.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 13 — add register: DATETIME generator', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    await selectDataType(mainPage, 'DATETIME')
    await mainPage.getByTestId('add-reg-generator-btn').click()
    await mainPage.getByTestId('add-reg-address-input').locator('input').fill('114')
    const intervalInput = mainPage.getByTestId('add-reg-interval-input').locator('input')
    await expect(intervalInput).toBeVisible()
    await intervalInput.fill('5')
    const commentInput13 = mainPage.getByTestId('add-reg-comment-input').locator('input')
    await commentInput13.fill('System Clock')
    await commentInput13.evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)

    const modal = paperOf(mainPage, 'add-reg-address-input')
    await modal.screenshot({ path: resolve(SHOTS, 'add-register-datetime-generator.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 14 — add register datatype dropdown', async ({ mainPage }) => {
    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()

    // Open datatype dropdown
    await mainPage.getByTestId('add-reg-type-select').click()
    await beat(mainPage, 300)

    const listbox = mainPage.getByRole('listbox')
    await listbox.screenshot({ path: resolve(SHOTS, 'add-register-dropdown.png') })

    // Close dropdown + modal
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 200)
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT III — GOING LIVE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act III — Going Live', () => {
  test('scene 15 — client connects & reads raw data', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '23')
    await beat(mainPage, 3500)
    await snap(mainPage, 'client-raw-data')
  })

  test('scene 16 — register type dropdown', async ({ mainPage }) => {
    await mainPage.getByTestId('reg-type-select').click()
    await beat(mainPage, 300)

    const listbox = mainPage.getByRole('listbox')
    await listbox.screenshot({ path: resolve(SHOTS, 'register-type-dropdown.png') })

    // Close dropdown (re-select Holding Registers)
    await mainPage.getByRole('option', { name: 'Holding Registers' }).click()
    await beat(mainPage, 200)
  })

  test('scene 17 — cog menu', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await beat(mainPage, 300)

    const popover = mainPage.locator('.MuiPopover-paper')
    await popover.screenshot({ path: resolve(SHOTS, 'cog-menu.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 18 — advanced mode', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    const advCheckbox = mainPage.getByTestId('advanced-mode-checkbox')
    await advCheckbox.waitFor({ state: 'visible', timeout: 5000 })
    const advInput = advCheckbox.locator('input[type="checkbox"]')
    if (!(await advInput.isChecked())) {
      await advCheckbox.click()
      await mainPage.waitForTimeout(200)
    }
    const bit64Checkbox = mainPage.getByTestId('show-64bit-checkbox')
    const bit64Input = bit64Checkbox.locator('input[type="checkbox"]')
    if (!(await bit64Input.isChecked())) {
      await bit64Checkbox.click()
      await mainPage.waitForTimeout(200)
    }

    // Close menu and blur cog button
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 200)
    await mainPage.getByTestId('menu-btn').evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage)
    await snap(mainPage, 'client-advanced-mode')
  })

  test('scene 19 — client config with decoded values', async ({ mainPage }) => {
    // Disable advanced mode
    await mainPage.getByTestId('menu-btn').click()
    const advCheckbox = mainPage.getByTestId('advanced-mode-checkbox')
    const advInput = advCheckbox.locator('input[type="checkbox"]')
    if (await advInput.isChecked()) {
      await advCheckbox.click()
      await mainPage.waitForTimeout(200)
    }
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)

    // Load client config
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await mainPage.waitForTimeout(500)

    // Re-read to populate decoded values
    await readRegisters(mainPage, '0', '23')
    await beat(mainPage, 3500)

    expect(await cell(mainPage, 0, 'value')).toBe('387')
    const freq = await cell(mainPage, 4, 'value')
    expect(freq).toContain('50.01')

    await snap(mainPage, 'client-decoded-values')
  })

  test('scene 20 — read configuration mode', async ({ mainPage }) => {
    await enableReadConfiguration(mainPage)
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage)

    // Blur read button before screenshot
    await mainPage.getByTestId('read-btn').evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage, 200)
    await snap(mainPage, 'client-read-config')
  })

  test('scene 21 — client bitmap alarm dashboard', async ({ mainPage }) => {
    const expandBtn = mainPage.getByTestId('bitmap-expand-12')
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()
    await beat(mainPage, 500)

    // Deselect any selected row
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)

    await snap(mainPage, 'client-bitmap') // <---- RAW OFF

    // ── Bit indicator screenshots (value 21 = bits 0,2,4 ON) ──

    // success active: bit 0 (Running) — green, ON
    await mainPage.getByTestId('bit-indicator-0').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-success-active.png')
    })
    // success inactive: bit 7 (Comm OK) — green, OFF
    await mainPage.getByTestId('bit-indicator-7').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-success-inactive.png')
    })
    // warning inactive: bit 3 (Overtemp) — orange, OFF
    await mainPage.getByTestId('bit-indicator-3').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-warning-inactive.png')
    })
    // error inactive: bit 1 (Alarm) — red, OFF
    await mainPage.getByTestId('bit-indicator-1').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-error-inactive.png')
    })
    // inverted active: bit 15 (Watchdog) — error color, invert=true, raw OFF → display ON
    await mainPage.getByTestId('bit-indicator-15').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-inverted-active.png')
    })

    // ── Active variants: write value 42 (bits 1,3,5 ON) ──

    // Collapse bitmap to access write action button
    await expandBtn.click()
    await beat(mainPage, 300)

    await writeRegister(mainPage, 12, '42', 'fc6', 'UINT16')
    await beat(mainPage, 300)

    // Re-read to get updated value
    await mainPage.getByTestId('read-btn').click()
    await beat(mainPage, 1000)

    // Re-expand bitmap
    await expandBtn.click()
    await beat(mainPage, 500)

    // error active: bit 1 (Alarm) — red, ON
    await mainPage.getByTestId('bit-indicator-1').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-error-active.png')
    })
    // warning active: bit 3 (Overtemp) — orange, ON
    await mainPage.getByTestId('bit-indicator-3').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-warning-active.png')
    })

    // ── Inverted inactive variant: write 32810 (32768 + 42 = bit 15 ON + bits 1,3,5 ON) ──
    await expandBtn.click()
    await beat(mainPage, 300)
    await writeRegister(mainPage, 12, '32810', 'fc6', 'UINT16')
    await beat(mainPage, 300)
    await mainPage.getByTestId('read-btn').click()
    await beat(mainPage, 1000)
    await expandBtn.click()
    await beat(mainPage, 500)

    // inverted inactive: bit 15 (Watchdog) — error color, invert=true, raw ON → display OFF
    await mainPage.getByTestId('bit-indicator-15').screenshot({
      path: resolve(SHOTS, 'client-bitmap-bit-inverted-inactive.png')
    })

    // Restore original value
    await expandBtn.click()
    await beat(mainPage, 300)
    await writeRegister(mainPage, 12, '21', 'fc6', 'UINT16')
    await beat(mainPage, 300)

    await mainPage.getByTestId('read-btn').click()
    await beat(mainPage, 500)

    // Restore RAW button state to false (because write register sets it to true)
    await disableClientRawMode(mainPage)
  })

  test('scene 22 — input registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Input Registers')
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage)
    await mainPage.getByTestId('read-btn').evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage, 200)
    await snap(mainPage, 'client-input-registers') /// <----- RAW ON
  })

  test('scene 23 — reading coils', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)

    expect(await cell(mainPage, 0, 'bit')).toBe('TRUE')
    expect(await cell(mainPage, 3, 'bit')).toBe('FALSE')

    await snap(mainPage, 'client-coils')
  })

  test('scene 24 — reading discrete inputs', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)

    expect(await cell(mainPage, 0, 'bit')).toBe('TRUE')
    expect(await cell(mainPage, 2, 'bit')).toBe('FALSE')

    await snap(mainPage, 'client-discrete-inputs')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT IV — INTERACTION
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act IV — Interaction', () => {
  test('scene 25 — write coil', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage, 300)

    // Open write modal for Night Mode (addr 3)
    await mainPage.getByTestId('write-action-3').click()
    await expect(mainPage.getByTestId('write-coil-3-select-btn')).toBeVisible()

    // Toggle coil ON
    await mainPage.getByTestId('write-coil-3-select-btn').click()
    await beat(mainPage, 300)

    // Screenshot the OPEN write modal
    const writeModal = paperOf(mainPage, 'write-coil-3-select-btn')
    await writeModal.screenshot({ path: resolve(SHOTS, 'client-write-coil.png') })

    // Submit write and close
    await mainPage.getByTestId('write-fc5-btn').click()
    await mainPage.getByTestId('write-submit-btn').click()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('write-coil-3-select-btn')).not.toBeVisible()
    await beat(mainPage, 300)

    // Re-read to confirm
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)
    expect(await cell(mainPage, 3, 'bit')).toBe('TRUE')

    // ── FC15 multi-coil write ──
    await mainPage.getByTestId('write-action-3').click()
    await expect(mainPage.getByTestId('write-coil-3-select-btn')).toBeVisible()
    await mainPage.getByTestId('write-fc15-btn').click()
    await beat(mainPage, 300)

    // Toggle some coils in the grid for visual effect
    await mainPage.getByTestId('write-coil-3-select-btn').click()
    await mainPage.getByTestId('write-coil-5-select-btn').click()
    await mainPage.getByTestId('write-coil-7-select-btn').click()
    await beat(mainPage, 300)

    const writeModalFc15 = paperOf(mainPage, 'write-coil-3-select-btn')
    await writeModalFc15.screenshot({ path: resolve(SHOTS, 'client-write-coil-fc15.png') })

    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  test('scene 26 — write holding register', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '2')
    await beat(mainPage, 300)

    // Open write modal for DC Voltage (addr 0)
    await mainPage.getByTestId('write-action-0').click()
    await expect(mainPage.getByTestId('write-value-input')).toBeVisible()

    // Fill value
    const valueInput = mainPage.getByTestId('write-value-input').locator('input')
    await valueInput.fill('400')
    await beat(mainPage, 300)

    // Screenshot the OPEN write modal (use page clip with padding to avoid label clipping)
    const writeModal = paperOf(mainPage, 'write-value-input')
    const box = await writeModal.boundingBox()
    if (box) {
      const pad = 12
      await mainPage.screenshot({
        path: resolve(SHOTS, 'client-write-register.png'),
        clip: { x: box.x, y: Math.max(0, box.y - pad), width: box.width, height: box.height + pad }
      })
    }

    // Submit FC6 and close
    await mainPage.getByTestId('write-fc6-btn').click()
    await mainPage.keyboard.press('Escape')
    await expect(mainPage.getByTestId('write-value-input')).not.toBeVisible({ timeout: 5000 })
    await beat(mainPage, 300)

    // Re-read to verify
    await readRegisters(mainPage, '0', '2')
    await beat(mainPage)
    expect(await cell(mainPage, 0, 'hex')).toBe('0190')

    // Restore RAW button state to false (because write register sets it to true)
    await disableClientRawMode(mainPage)
  })

  test('scene 27 — live polling', async ({ mainPage }) => {
    await clearData(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await enableReadConfiguration(mainPage)
    await beat(mainPage, 500)

    const initialPower = await cell(mainPage, 2, 'value')

    // Start polling
    await mainPage.getByTestId('poll-btn').click()
    await beat(mainPage, 3000)

    await expect(async () => {
      const newPower = await cell(mainPage, 2, 'value')
      expect(newPower).not.toBe(initialPower)
    }).toPass({ timeout: 8000 })

    // Stop polling
    await mainPage.getByTestId('poll-btn').click()
    await beat(mainPage, 500)

    // Blur poll button before screenshot
    await mainPage.getByTestId('poll-btn').evaluate((el) => (el as HTMLElement).blur())
    await beat(mainPage, 200)
    await snap(mainPage, 'client-polling')
  })

  test('scene 28 — transaction log', async ({ mainPage }) => {
    // Switch to raw data view (not read configuration)
    await disableReadConfiguration(mainPage)
    await readRegisters(mainPage, '0', '23')
    await beat(mainPage, 500)

    await mainPage.getByTestId('show-log-btn').click()
    await beat(mainPage)
    await snap(mainPage, 'client-transaction-log')

    // Hide log
    await mainPage.getByTestId('show-log-btn').click()
    await beat(mainPage, 300)
  })

  test('scene 29 — scanning', async ({ mainPage }) => {
    // Open cog menu → Scan Registers
    await mainPage.getByTestId('menu-btn').click()
    await beat(mainPage, 300)

    await mainPage.getByTestId('scan-registers-btn').click()
    await beat(mainPage, 500)

    // Use large scan range to keep progress bar visible
    const scanLengthInput = mainPage.getByTestId('scan-length-input').locator('input')
    await scanLengthInput.fill('50000')
    await beat(mainPage, 200)

    // Start scan
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await beat(mainPage, 1500)

    // Screenshot dialog with progress bar
    const scanDialog = paperOf(mainPage, 'scan-start-stop-btn')
    await scanDialog.screenshot({ path: resolve(SHOTS, 'client-scanning.png') })

    // Stop scan
    await mainPage.getByTestId('scan-start-stop-btn').click()
    await beat(mainPage, 500)

    // Close scan dialog
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT V — SIDE BY SIDE
// ═══════════════════════════════════════════════════════════════════════════

let serverPage: Page

test.describe.serial('Act V — Side by Side', () => {
  test('scene 30 — split view', async ({ electronApp, mainPage }) => {
    await disconnectClient(mainPage)
    await navigateToHome(mainPage)
    await beat(mainPage, 3500)

    // Open split view
    await mainPage.getByTestId('home-split-btn').click()
    serverPage = await electronApp.waitForEvent('window', { timeout: 10000 })
    await serverPage.waitForLoadState('domcontentloaded')
    await beat(serverPage, 1500)

    await snap(mainPage, 'split-view-client')
    await snap(serverPage, 'split-view-server')
  })

  test('scene 31 — split view connected', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await enableReadConfiguration(mainPage)
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage, 3500)

    await snap(mainPage, 'split-view-connected')
  })

  test('scene 32 — cleanup', async ({ electronApp, mainPage }) => {
    await disconnectClient(mainPage)

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .filter((w) => w.getTitle() === 'Server')
        .forEach((w) => w.close())
    })
    await beat(mainPage, 500)

    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
  })
})
