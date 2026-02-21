/**
 * Hardware E2E Test — Schneider iEM3000 via Arduino RTU emulator
 *
 * Requires a physical Arduino Uno running tools/arduino/iem3000.ino
 * connected via USB serial (9600 baud, 8N1, Slave ID 1).
 *
 * Run headed so you can interact with the Playwright Inspector pause dialog:
 *   npx playwright test e2e/specs/99-hardware/ --headed
 *
 * When page.pause() triggers:
 *   1. Click the refresh button next to COM port to scan available ports
 *   2. Select the Arduino's COM port from the dropdown
 *   3. Click "Resume" in the Playwright Inspector
 */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClientRTU,
  loadClientConfig,
  disconnectClient,
  enableAdvancedMode,
  scrollCell,
  clearData
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-iem3000.json')

test.describe.serial('Hardware — iEM3000 RTU (Arduino emulator)', () => {
  // ─── Setup ──────────────────────────────────────────────────────────

  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('switch to RTU and configure serial parameters', async ({ mainPage }) => {
    await connectClientRTU(mainPage, '1', '9600', 'none', '8', '1')
  })

  test('pause — select COM port manually, then resume', async ({ mainPage }) => {
    // eslint-disable-next-line no-console
    console.log(
      '\n╔══════════════════════════════════════════════════════════════╗\n' +
        '║  MANUAL STEP: Select the Arduino COM port                   ║\n' +
        '║                                                              ║\n' +
        '║  1. Click the refresh button (↻) next to the COM port       ║\n' +
        '║  2. Select the Arduino serial port from the dropdown         ║\n' +
        '║     (e.g. /dev/ttyUSB0, /dev/tty.usbmodem*, COM3)           ║\n' +
        '║  3. Click "Resume" in the Playwright Inspector               ║\n' +
        '║                                                              ║\n' +
        '║  If no Arduino is connected, close the Inspector to skip.    ║\n' +
        '╚══════════════════════════════════════════════════════════════╝\n'
    )
    await mainPage.pause()
  })

  test('load iEM3000 client config', async ({ mainPage }) => {
    await loadClientConfig(mainPage, CLIENT_CONFIG)
  })

  test('connect to Arduino', async ({ mainPage }) => {
    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })
  })

  test('enable advanced mode', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  // ─── Read configuration registers ──────────────────────────────────

  test('read all configured registers via read-config', async ({ mainPage }) => {
    test.setTimeout(30_000)

    // Enable read configuration mode
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await btn.click()
    await expect(btn).toHaveClass(/Mui-selected/)

    // Trigger read
    await mainPage.getByTestId('read-btn').click()

    // Wait for rows to populate (26 float registers = 52 individual register words + extra rows)
    await mainPage.waitForTimeout(5000)
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  // ─── Value verification ────────────────────────────────────────────

  test('phase currents are in expected range', async ({ mainPage }) => {
    // I1 ~18.5A (±3.5 → 15–22)
    const i1 = Number(await scrollCell(mainPage, 2999, 'word_float'))
    expect(i1).toBeGreaterThanOrEqual(15)
    expect(i1).toBeLessThanOrEqual(22)

    // I2 ~17.8A (±3.8 → 14–21)
    const i2 = Number(await scrollCell(mainPage, 3001, 'word_float'))
    expect(i2).toBeGreaterThanOrEqual(14)
    expect(i2).toBeLessThanOrEqual(21)

    // I3 ~19.1A (±3.1 → 16–23)
    const i3 = Number(await scrollCell(mainPage, 3003, 'word_float'))
    expect(i3).toBeGreaterThanOrEqual(16)
    expect(i3).toBeLessThanOrEqual(23)
  })

  test('phase-neutral voltages are ~230V', async ({ mainPage }) => {
    for (const addr of [3027, 3029, 3031]) {
      const v = Number(await scrollCell(mainPage, addr, 'word_float'))
      expect(v).toBeGreaterThanOrEqual(225)
      expect(v).toBeLessThanOrEqual(235)
    }
  })

  test('line-line voltages are ~398V', async ({ mainPage }) => {
    for (const addr of [3019, 3021, 3023]) {
      const v = Number(await scrollCell(mainPage, addr, 'word_float'))
      expect(v).toBeGreaterThanOrEqual(390)
      expect(v).toBeLessThanOrEqual(410)
    }
  })

  test('active power values are positive', async ({ mainPage }) => {
    for (const addr of [3053, 3055, 3057, 3059]) {
      const p = Number(await scrollCell(mainPage, addr, 'word_float'))
      expect(p).toBeGreaterThan(0)
    }
  })

  test('reactive power values are positive', async ({ mainPage }) => {
    for (const addr of [3061, 3063, 3065, 3067]) {
      const q = Number(await scrollCell(mainPage, addr, 'word_float'))
      expect(q).toBeGreaterThan(0)
    }
  })

  test('apparent power values are positive', async ({ mainPage }) => {
    for (const addr of [3069, 3071, 3073, 3075]) {
      const s = Number(await scrollCell(mainPage, addr, 'word_float'))
      expect(s).toBeGreaterThan(0)
    }
  })

  test('power factor total is ~0.92', async ({ mainPage }) => {
    const pf = Number(await scrollCell(mainPage, 3083, 'word_float'))
    expect(pf).toBeGreaterThanOrEqual(0.9)
    expect(pf).toBeLessThanOrEqual(0.94)
  })

  // ─── Polling — verify noise causes value changes ───────────────────

  test('re-read shows updated values (emulator noise)', async ({ mainPage }) => {
    test.setTimeout(15_000)

    // Capture a value before re-reading
    const before = await scrollCell(mainPage, 2999, 'word_float')

    // Clear and re-read
    await clearData(mainPage)
    await mainPage.getByTestId('read-btn').click()
    await mainPage.waitForTimeout(5000)

    const after = await scrollCell(mainPage, 2999, 'word_float')

    // With noise the float values should differ slightly
    expect(after).not.toBe(before)
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('disable read-config mode', async ({ mainPage }) => {
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await btn.click()
    await expect(btn).not.toHaveClass(/Mui-selected/)
  })

  test('disconnect from Arduino', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('switch back to TCP mode', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
    await expect(mainPage.getByTestId('protocol-tcp-btn')).toHaveClass(/Mui-selected/)
  })
})
