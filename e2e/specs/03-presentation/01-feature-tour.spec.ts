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
  connectClient,
  disconnectClient,
  readRegisters,
  clearData,
  selectRegisterType,
  selectUnitId,
  enableReadConfiguration,
  disableReadConfiguration,
  writeRegister,
  writeCoil,
  cell
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { type Page } from '@playwright/test'

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHOTS = resolve(__dirname, '../../presentation-output/screenshots')
const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')

const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-presentation.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-presentation.json')

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Small pause to let animations finish and state settle before a screenshot */
const beat = (page: Page, ms = 600): Promise<void> => page.waitForTimeout(ms)

/** Take a named screenshot */
const snap = (page: Page, name: string): Promise<Buffer> =>
  page.screenshot({ path: resolve(SHOTS, `${name}.png`) })

// ═══════════════════════════════════════════════════════════════════════════
//  ACT I — THE STAGE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act I — The Stage', () => {
  // ┌─────────────────────────────────────────────────┐
  // │  Scene 1 · Home Screen                          │
  // │  The app opens — three doors: Server, Split,    │
  // │  Client. Version badge, Ploxc branding.         │
  // └─────────────────────────────────────────────────┘

  test('scene 1 — home screen', async ({ mainPage }) => {
    await navigateToHome(mainPage)
    await beat(mainPage, 800) // let fade-in animation complete
    await snap(mainPage, 'home')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT II — BUILDING THE SIMULATOR
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act II — Building the Simulator', () => {
  // ┌─────────────────────────────────────────────────┐
  // │  Scene 2 · Loading a Server Config              │
  // │  We load "Solar Edge 10K" — a realistic solar   │
  // │  inverter with holding & input registers,       │
  // │  coils, discrete inputs, generators, bitmap,    │
  // │  UTF-8, timestamps.                             │
  // └─────────────────────────────────────────────────┘

  test('scene 2 — load server config', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await beat(mainPage, 3500) // let snackbar auto-dismiss (3s)

    // Verify loaded
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(11)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 3 · Server Overview                      │
  // │  All four panels expanded — the full picture.   │
  // │  Registers, booleans, data types, generators.   │
  // └─────────────────────────────────────────────────┘

  test('scene 3 — server overview', async ({ mainPage }) => {
    await expandAllServerPanels(mainPage)
    await beat(mainPage)
    await snap(mainPage, 'server-overview')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 4 · Server Booleans                      │
  // │  Coils with toggle circles and meaningful       │
  // │  comments: Inverter ON, MPPT Active, Fan, etc.  │
  // │  Green glowing circles show active states.      │
  // └─────────────────────────────────────────────────┘

  test('scene 4 — server booleans (coils)', async ({ mainPage }) => {
    const coilsSection = mainPage.getByTestId('section-coils')
    await coilsSection.screenshot({ path: resolve(SHOTS, 'server-booleans.png') })
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 5 · Discrete Inputs                      │
  // │  Read-only boolean inputs: DC Present, Grid     │
  // │  Connected, Emergency Stop, Door Closed...      │
  // └─────────────────────────────────────────────────┘

  test('scene 5 — server discrete inputs', async ({ mainPage }) => {
    const diSection = mainPage.getByTestId('section-discrete_inputs')
    await diSection.screenshot({ path: resolve(SHOTS, 'server-discrete-inputs.png') })
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 6 · Server Bitmap                        │
  // │  Expand the "System Status" bitmap at addr 12.  │
  // │  16 individual bits with toggle circles.        │
  // │  value=21 → bits 0, 2, 4 ON (Running, Grid     │
  // │  Sync, MPPT Active).                            │
  // └─────────────────────────────────────────────────┘

  test('scene 6 — server bitmap detail', async ({ mainPage }) => {
    const holdingSection = mainPage.getByTestId('section-holding_registers')
    await holdingSection.scrollIntoViewIfNeeded()
    await beat(mainPage, 300)

    // Expand bitmap at address 12
    const bitmapExpand = mainPage.getByTestId('server-bitmap-expand-12')
    await expect(bitmapExpand).toBeVisible()
    await bitmapExpand.click()
    await beat(mainPage, 500)

    await snap(mainPage, 'server-bitmap')

    // Leave expanded for video — will collapse later
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 7 · Add Register Modal                   │
  // │  Show the modal with data type dropdown,        │
  // │  fixed/generator toggle, address, value,        │
  // │  comment fields.                                │
  // └─────────────────────────────────────────────────┘

  test('scene 7 — add register modal', async ({ mainPage }) => {
    // Collapse bitmap first for a cleaner view
    const bitmapExpand = mainPage.getByTestId('server-bitmap-expand-12')
    await bitmapExpand.click()
    await beat(mainPage, 300)

    await mainPage.getByTestId('add-holding_registers-btn').click()
    await expect(mainPage.getByTestId('add-reg-address-input')).toBeVisible()
    await beat(mainPage)
    await snap(mainPage, 'add-register')

    // Close modal
    await mainPage.keyboard.press('Escape')
    await beat(mainPage, 300)
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 8 · Multi-Unit Configuration             │
  // │  Switch to Unit ID 1 — a second inverter in     │
  // │  night mode (no DC, 0V/0A). Shows multi-unit    │
  // │  simulation on a single port.                   │
  // └─────────────────────────────────────────────────┘

  test('scene 8 — multi-unit (unit 1)', async ({ mainPage }) => {
    await selectUnitId(mainPage, '1')
    await beat(mainPage)

    // Verify different data — Unit 1 is in night mode
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')

    await snap(mainPage, 'server-unit1')

    // Switch back to unit 0
    await selectUnitId(mainPage, '0')
    await beat(mainPage, 300)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT III — GOING LIVE
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act III — Going Live', () => {
  // ┌─────────────────────────────────────────────────┐
  // │  Scene 9 · Connecting to the Server             │
  // │  Navigate to client, connect to 127.0.0.1:502.  │
  // │  Read holding registers — raw hex and word      │
  // │  columns fill up with live solar data.          │
  // └─────────────────────────────────────────────────┘

  test('scene 9 — client connects & reads raw data', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '23')
    await beat(mainPage, 3500) // let "Connected to server" snackbar auto-dismiss
    await snap(mainPage, 'client-raw-data')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 10 · Advanced Mode                       │
  // │  Enable advanced mode to show all data type     │
  // │  interpretation columns simultaneously —        │
  // │  int16, uint16, int32, uint32, float.           │
  // │  The full decoder ring.                         │
  // └─────────────────────────────────────────────────┘

  test('scene 10 — advanced mode columns', async ({ mainPage }) => {
    // Toggle advanced mode + 64-bit columns
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
    await mainPage.keyboard.press('Escape')
    await beat(mainPage)
    await snap(mainPage, 'client-advanced-mode')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 11 · Loading Client Configuration        │
  // │  Load "Solar Edge 10K" client config — data     │
  // │  types assigned, scaling factors applied,       │
  // │  comments mapped. Re-read to decode values.     │
  // └─────────────────────────────────────────────────┘

  test('scene 11 — client config with decoded values', async ({ mainPage }) => {
    // Disable advanced mode (64-bit auto-disables when advanced is off)
    await mainPage.getByTestId('menu-btn').click()
    const advCheckbox = mainPage.getByTestId('advanced-mode-checkbox')
    const advInput = advCheckbox.locator('input[type="checkbox"]')
    if (await advInput.isChecked()) {
      await advCheckbox.click()
      await mainPage.waitForTimeout(200)
    }
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)

    // Load client config with data type mappings and scaling
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await mainPage.waitForTimeout(500)

    // Re-read to populate value column with decoded data
    await readRegisters(mainPage, '0', '23')
    await beat(mainPage, 3500) // let "Configuration opened" snackbar dismiss

    // Verify decoded values
    expect(await cell(mainPage, 0, 'value')).toBe('387') // DC Voltage
    const freq = await cell(mainPage, 4, 'value')
    expect(freq).toContain('50.01') // Grid Frequency

    await snap(mainPage, 'client-decoded-values')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 12 · Read Configuration Mode             │
  // │  Enable Read Configuration — the grid filters   │
  // │  to only configured registers, grouped reads    │
  // │  with group index column and decoded values.    │
  // └─────────────────────────────────────────────────┘

  test('scene 12 — read configuration mode', async ({ mainPage }) => {
    await enableReadConfiguration(mainPage)
    // Read config creates zero-value placeholders — trigger actual read
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage)
    await snap(mainPage, 'client-read-config')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 13 · Client Bitmap — Alarm Dashboard     │
  // │  Expand the "System Status" bitmap. Colored     │
  // │  indicators: green (Running, Grid Sync),        │
  // │  red (Alarm), orange (Overtemp, Fan).           │
  // │  Invert on Watchdog. The alarm dashboard.       │
  // └─────────────────────────────────────────────────┘

  test('scene 13 — client bitmap alarm dashboard', async ({ mainPage }) => {
    const expandBtn = mainPage.getByTestId('bitmap-expand-12')
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()
    await beat(mainPage, 500)
    await snap(mainPage, 'client-bitmap')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 14 · Reading Input Registers             │
  // │  Switch to input registers — firmware version,  │
  // │  grid voltage (generator!), power factor.       │
  // └─────────────────────────────────────────────────┘

  test('scene 14 — input registers', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await selectRegisterType(mainPage, 'Input Registers')
    await enableReadConfiguration(mainPage)
    // Trigger actual read through config groups
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage)
    await snap(mainPage, 'client-input-registers')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 15 · Reading Coils                       │
  // │  Switch to coils — see the boolean states       │
  // │  from the server. Inverter ON, MPPT Active...   │
  // └─────────────────────────────────────────────────┘

  test('scene 15 — reading coils', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)

    // Verify expected states
    expect(await cell(mainPage, 0, 'bit')).toBe('TRUE') // Inverter ON
    expect(await cell(mainPage, 3, 'bit')).toBe('FALSE') // Night Mode off

    await snap(mainPage, 'client-coils')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 16 · Reading Discrete Inputs             │
  // │  Read-only boolean sensors: DC present, Grid    │
  // │  connected, door closed, firmware OK...         │
  // └─────────────────────────────────────────────────┘

  test('scene 16 — reading discrete inputs', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)

    expect(await cell(mainPage, 0, 'bit')).toBe('TRUE') // DC Input Present
    expect(await cell(mainPage, 2, 'bit')).toBe('FALSE') // Emergency Stop

    await snap(mainPage, 'client-discrete-inputs')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT IV — INTERACTION
// ═══════════════════════════════════════════════════════════════════════════

test.describe.serial('Act IV — Interaction', () => {
  // ┌─────────────────────────────────────────────────┐
  // │  Scene 17 · Writing a Coil                      │
  // │  Toggle the "Night Mode" coil (addr 3) to ON    │
  // │  using FC5. Verify the server received it.      │
  // └─────────────────────────────────────────────────┘

  test('scene 17 — write coil', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage, 300)

    // Night Mode was FALSE — write TRUE
    await writeCoil(mainPage, 3, true)
    await beat(mainPage, 300)

    // Re-read to confirm write
    await readRegisters(mainPage, '0', '8')
    await beat(mainPage)

    expect(await cell(mainPage, 3, 'bit')).toBe('TRUE')
    await snap(mainPage, 'client-write-coil')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 18 · Writing a Holding Register          │
  // │  Change the DC Voltage (addr 0) from 387 to     │
  // │  400 using FC6. Show the write dialog.          │
  // └─────────────────────────────────────────────────┘

  test('scene 18 — write holding register', async ({ mainPage }) => {
    await clearData(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '2')
    await beat(mainPage, 300)

    await writeRegister(mainPage, 0, '400', 'fc6', 'UINT16')
    await beat(mainPage, 300)

    // Re-read to verify
    await readRegisters(mainPage, '0', '2')
    await beat(mainPage)

    expect(await cell(mainPage, 0, 'hex')).toBe('0190') // 400 decimal = 0x0190
    await snap(mainPage, 'client-write-register')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 19 · Live Polling                        │
  // │  Start continuous polling — watch the           │
  // │  generator values change in real time.          │
  // │  DC Current, AC Power, Energy Today all         │
  // │  fluctuating as the "inverter produces power".  │
  // └─────────────────────────────────────────────────┘

  test('scene 19 — live polling', async ({ mainPage }) => {
    await clearData(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await enableReadConfiguration(mainPage)
    await beat(mainPage, 500)

    // Capture initial value of a generator register
    const initialPower = await cell(mainPage, 2, 'value')

    // Start polling
    await mainPage.getByTestId('poll-btn').click()
    await beat(mainPage, 3000) // let several poll cycles happen

    // Generator value should have changed
    await expect(async () => {
      const newPower = await cell(mainPage, 2, 'value')
      expect(newPower).not.toBe(initialPower)
    }).toPass({ timeout: 8000 })

    await snap(mainPage, 'client-polling')

    // Stop polling
    await mainPage.getByTestId('poll-btn').click()
    await beat(mainPage, 500)
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 20 · Transaction Log                     │
  // │  Show the raw Modbus communication log —        │
  // │  timestamps, function codes, request/response.  │
  // └─────────────────────────────────────────────────┘

  test('scene 20 — transaction log', async ({ mainPage }) => {
    await mainPage.getByTestId('show-log-btn').click()
    await beat(mainPage)
    await snap(mainPage, 'client-transaction-log')

    // Hide log again
    await mainPage.getByTestId('show-log-btn').click()
    await beat(mainPage, 300)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
//  ACT V — SIDE BY SIDE
// ═══════════════════════════════════════════════════════════════════════════

let serverPage: Page

test.describe.serial('Act V — Side by Side', () => {
  // ┌─────────────────────────────────────────────────┐
  // │  Scene 21 · Split View                          │
  // │  Open split view: server in a separate window,  │
  // │  client stays in the main window. Both visible  │
  // │  simultaneously for local testing.              │
  // └─────────────────────────────────────────────────┘

  test('scene 21 — split view', async ({ electronApp, mainPage }) => {
    // Disconnect and return home
    await disconnectClient(mainPage)
    await navigateToHome(mainPage)
    await beat(mainPage, 3500) // let "Disconnected" snackbar dismiss

    // Open split view
    await mainPage.getByTestId('home-split-btn').click()
    serverPage = await electronApp.waitForEvent('window', { timeout: 10000 })
    await serverPage.waitForLoadState('domcontentloaded')
    await beat(serverPage, 1500) // let server window fully render

    // Screenshot the client window (main)
    await snap(mainPage, 'split-view-client')

    // Screenshot the server window
    await snap(serverPage, 'split-view-server')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 22 · Split View — Connected              │
  // │  Connect the client to the local server.        │
  // │  Read data while server is visible in the       │
  // │  other window. The full development workflow.   │
  // └─────────────────────────────────────────────────┘

  test('scene 22 — split view connected', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await enableReadConfiguration(mainPage)
    // Trigger actual read so values populate
    await mainPage.getByTestId('read-btn').click()
    await expect(async () => {
      const val = await cell(mainPage, 0, 'value')
      expect(val).not.toBe('0')
    }).toPass({ timeout: 5000 })
    await beat(mainPage, 3500) // let snackbars dismiss

    await snap(mainPage, 'split-view-connected')
  })

  // ┌─────────────────────────────────────────────────┐
  // │  Scene 23 · Cleanup                             │
  // │  Close the server window. Back to normal.       │
  // └─────────────────────────────────────────────────┘

  test('scene 23 — cleanup', async ({ electronApp, mainPage }) => {
    await disconnectClient(mainPage)

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()
        .filter((w) => w.getTitle() === 'Server')
        .forEach((w) => w.close())
    })
    await beat(mainPage, 500)

    // Main window should show home button again
    await expect(mainPage.getByTestId('home-btn')).toBeVisible()
  })
})
