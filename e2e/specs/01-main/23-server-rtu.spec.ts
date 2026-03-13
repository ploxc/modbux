/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToServer,
  navigateToClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  connectClientRTU,
  disconnectClient,
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  readRegisters,
  cell,
  expandAllServerPanels,
  selectRegisterType
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-huawei-smartlogger.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-huawei-smartlogger.json')

const SOCAT_PATH = '/usr/local/bin/socat'
const PTY_0 = '/tmp/ttyV0'
const PTY_1 = '/tmp/ttyV1'
const hasSocat = existsSync(SOCAT_PATH)

// ─── Block 1: Server RTU UI Elements ─────────────────────────────────────────

test.describe.serial('Server RTU — UI elements', () => {
  test('navigate to server view', async ({ mainPage }) => {
    await navigateToServer(mainPage)
  })

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  // ─── Mode toggle ───────────────────────────────────────────────────

  test('default server mode is TCP', async ({ mainPage }) => {
    const tcpBtn = mainPage.getByTestId('server-mode-tcp-btn')
    await expect(tcpBtn).toBeVisible()
    await expect(tcpBtn).toHaveClass(/Mui-selected/)

    // TCP elements visible
    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
    await expect(mainPage.getByTestId('select-server-502')).toBeVisible()
  })

  test('switch to RTU hides TCP elements, shows RTU config', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-rtu-btn').click()

    // TCP elements hidden
    await expect(mainPage.getByTestId('server-port-input')).not.toBeVisible()

    // RTU config fields visible
    await expect(mainPage.getByTestId('server-rtu-com-input')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-parity-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-databits-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-stopbits-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-status')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-refresh-btn')).toBeVisible()

    // RTU button selected
    await expect(mainPage.getByTestId('server-mode-rtu-btn')).toHaveClass(/Mui-selected/)
  })

  test('SelectServer hidden in RTU mode', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('select-server-502')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-server-btn')).not.toBeVisible()
  })

  test('RTU status shows inactive (no COM)', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-rtu-status')).toHaveAttribute(
      'title',
      'RTU server inactive'
    )
  })

  test('default RTU serial values', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).toContainText('9600')
    await expect(mainPage.getByTestId('server-rtu-parity-select')).toContainText('none')
    await expect(mainPage.getByTestId('server-rtu-databits-select')).toContainText('8')
    await expect(mainPage.getByTestId('server-rtu-stopbits-select')).toContainText('1')
  })

  test('unit ID and endian toggle remain visible', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-unitid-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-endian-be-btn')).toBeVisible()
  })

  // ─── Serial config fields ─────────────────────────────────────────

  test('refresh COM ports button works', async ({ mainPage }) => {
    await mainPage.getByTestId('server-rtu-refresh-btn').click()
    // Page still functional
    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).toBeVisible()
    await expect(mainPage.getByTestId('server-rtu-refresh-btn')).toBeVisible()
  })

  test('baudrate select has all options', async ({ mainPage }) => {
    await mainPage.getByTestId('server-rtu-baudrate-select').click()

    const expectedRates = ['1200', '2400', '4800', '9600', '19200', '38400', '57600', '115200']
    for (const rate of expectedRates) {
      await expect(mainPage.getByRole('option', { name: rate })).toBeVisible()
    }

    await mainPage.keyboard.press('Escape')
  })

  test('changing baudrate persists', async ({ mainPage }) => {
    await mainPage.getByTestId('server-rtu-baudrate-select').click()
    await mainPage.getByRole('option', { name: '115200' }).click()

    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).toContainText('115200')
  })

  test('parity, databits, stopbits selects work', async ({ mainPage }) => {
    // Change parity
    await mainPage.getByTestId('server-rtu-parity-select').click()
    await mainPage.getByRole('option', { name: 'even' }).click()
    await expect(mainPage.getByTestId('server-rtu-parity-select')).toContainText('even')

    // Change databits
    await mainPage.getByTestId('server-rtu-databits-select').click()
    await mainPage.getByRole('option', { name: '7' }).click()
    await expect(mainPage.getByTestId('server-rtu-databits-select')).toContainText('7')

    // Change stopbits
    await mainPage.getByTestId('server-rtu-stopbits-select').click()
    await mainPage.getByRole('option', { name: '2' }).click()
    await expect(mainPage.getByTestId('server-rtu-stopbits-select')).toContainText('2')
  })

  // ─── Mode switching preserves state ────────────────────────────────

  test('switch back to TCP restores TCP elements', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-tcp-btn').click()

    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
    await expect(mainPage.getByTestId('select-server-502')).toBeVisible()

    // RTU config hidden
    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).not.toBeVisible()
  })

  test('switching to RTU preserves changed serial values', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-rtu-btn').click()

    // Previously changed values should still be set
    await expect(mainPage.getByTestId('server-rtu-baudrate-select')).toContainText('115200')
    await expect(mainPage.getByTestId('server-rtu-parity-select')).toContainText('even')
    await expect(mainPage.getByTestId('server-rtu-databits-select')).toContainText('7')
    await expect(mainPage.getByTestId('server-rtu-stopbits-select')).toContainText('2')
  })

  test('switch to RTU and back preserves server data', async ({ mainPage }) => {
    // First switch to TCP and load config
    await mainPage.getByTestId('server-mode-tcp-btn').click()
    await loadServerConfig(mainPage, SERVER_CONFIG)

    // Check register count
    const section = mainPage.getByTestId('section-holding_registers')
    const textBefore = await section.textContent()
    const matchBefore = textBefore?.match(/\((\d+)\)/)
    expect(matchBefore).toBeTruthy()
    const countBefore = Number(matchBefore![1])
    expect(countBefore).toBeGreaterThanOrEqual(70)

    // Switch to RTU and back
    await mainPage.getByTestId('server-mode-rtu-btn').click()
    await mainPage.waitForTimeout(300)
    await mainPage.getByTestId('server-mode-tcp-btn').click()

    // Register count unchanged
    const textAfter = await section.textContent()
    const matchAfter = textAfter?.match(/\((\d+)\)/)
    expect(matchAfter).toBeTruthy()
    expect(Number(matchAfter![1])).toBe(countBefore)
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('cleanup: switch to TCP, expand panels', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-tcp-btn').click()
    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
    await expandAllServerPanels(mainPage)
  })
})

// ─── Block 2: RTU Round-Trip via Socat ───────────────────────────────────────

test.describe.serial('Server RTU — round-trip via socat', () => {
  test.skip(!hasSocat, 'socat not available')

  let socatProcess: ChildProcess | null = null

  // ─── Socat lifecycle ───────────────────────────────────────────────

  test('start socat virtual serial pair', async () => {
    // Clean up any leftover symlinks
    try {
      unlinkSync(PTY_0)
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(PTY_1)
    } catch {
      /* ignore */
    }

    socatProcess = spawn(SOCAT_PATH, [
      '-d',
      '-d',
      `pty,raw,echo=0,link=${PTY_0}`,
      `pty,raw,echo=0,link=${PTY_1}`
    ])

    // Poll for symlinks to exist (max 2s)
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (existsSync(PTY_0) && existsSync(PTY_1)) break
      await new Promise((r) => setTimeout(r, 100))
    }

    expect(existsSync(PTY_0)).toBe(true)
    expect(existsSync(PTY_1)).toBe(true)
  })

  // ─── Server setup ─────────────────────────────────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load Huawei server config (TCP mode)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await mainPage.waitForTimeout(500)

    // Verify registers loaded
    const section = mainPage.getByTestId('section-holding_registers')
    const text = await section.textContent()
    const match = text?.match(/\((\d+)\)/)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThanOrEqual(70)
  })

  test('switch server to RTU mode', async ({ mainPage }) => {
    await mainPage.getByTestId('server-mode-rtu-btn').click()
    await expect(mainPage.getByTestId('server-rtu-com-input')).toBeVisible()
  })

  test('enter server COM port /tmp/ttyV0', async ({ mainPage }) => {
    const comInput = mainPage.getByTestId('server-rtu-com-input').locator('input')
    await comInput.fill(PTY_0)
    await comInput.blur()
    await mainPage.waitForTimeout(500)
  })

  test('RTU status shows active', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-rtu-status')).toHaveAttribute(
      'title',
      'RTU server active',
      { timeout: 5000 }
    )
  })

  // ─── Client setup ─────────────────────────────────────────────────

  test('navigate to client', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('configure client RTU', async ({ mainPage }) => {
    await connectClientRTU(mainPage, '0', '9600', 'none', '8', '1')
  })

  test('enter client COM /tmp/ttyV1 + connect', async ({ mainPage }) => {
    const comInput = mainPage.getByTestId('rtu-com-input').locator('input')
    await comInput.fill(PTY_1)

    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })
  })

  test('enable advanced mode', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  // ─── Register spot-checks ─────────────────────────────────────────

  test('read time registers (40000-40016)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '40000', '17')

    // Year (U16 at 40011) = 2025
    const year = await cell(mainPage, 40011, 'word_uint16')
    expect(year).toBe('2025')

    // Month (U16 at 40012) = 6
    const month = await cell(mainPage, 40012, 'word_uint16')
    expect(month).toBe('6')
  })

  test('read power registers (40420-40429)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '40420', '10')

    // Active adjustment % (U16 at 40428) = 990
    const pct = await cell(mainPage, 40428, 'word_uint16')
    expect(pct).toBe('990')

    // Power Factor (I16 at 40429) = 30000
    const pf = await cell(mainPage, 40429, 'word_int16')
    expect(pf).toBe('30000')
  })

  test('read generator (40500)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '40500', '1')

    // DC Current generator (I16, range 500-520)
    const dc = await cell(mainPage, 40500, 'word_int16')
    const dcVal = Number(dc)
    expect(dcVal).toBeGreaterThanOrEqual(500)
    expect(dcVal).toBeLessThanOrEqual(520)
  })

  test('read energy registers (40560-40567)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '40560', '8')

    // Plant status Xinjiang (U16 at 40566) = 1
    const status = await cell(mainPage, 40566, 'word_uint16')
    expect(status).toBe('1')
  })

  test('read DI bitmap (40700)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '40700', '1')

    // DI status = 37
    const diStatus = await cell(mainPage, 40700, 'word_uint16')
    expect(diStatus).toBe('37')
  })

  test('read alarm bitmaps (50000-50002)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '50000', '3')

    const alarm1 = await cell(mainPage, 50000, 'word_uint16')
    expect(alarm1).toBe('2048')

    const alarm2 = await cell(mainPage, 50001, 'word_uint16')
    expect(alarm2).toBe('8')

    const alarm3 = await cell(mainPage, 50002, 'word_uint16')
    expect(alarm3).toBe('0')
  })

  test('read public registers (65521-65534)', async ({ mainPage }) => {
    test.setTimeout(15_000)
    await readRegisters(mainPage, '65521', '14')

    // Device list change number = 5
    const changeNum = await cell(mainPage, 65521, 'word_uint16')
    expect(changeNum).toBe('5')

    // Device connection status = 45057
    const connStatus = await cell(mainPage, 65534, 'word_uint16')
    expect(connStatus).toBe('45057')
  })

  // ─── ReadConfiguration via client config ───────────────────────────

  test('load client config + readConfiguration', async ({ mainPage }) => {
    test.setTimeout(30_000)

    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await enableReadConfiguration(mainPage)

    // Trigger a read
    await mainPage.getByTestId('read-btn').click()
    await mainPage.waitForTimeout(5000)

    // Grid should have rows
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)

    // Spot-check: year = 2025
    const year = await cell(mainPage, 40011, 'word_uint16')
    expect(year).toBe('2025')

    // Spot-check: active adjustment = 990
    const pct = await cell(mainPage, 40428, 'word_uint16')
    expect(pct).toBe('990')

    await disableReadConfiguration(mainPage)
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('disconnect client', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('switch client back to TCP', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await expect(mainPage.getByTestId('tcp-host-input')).toBeVisible()
  })

  test('switch server back to TCP', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await mainPage.getByTestId('server-mode-tcp-btn').click()
    await expect(mainPage.getByTestId('server-port-input')).toBeVisible()
  })

  test('cleanup: expand panels', async ({ mainPage }) => {
    await expandAllServerPanels(mainPage)
  })

  test('stop socat + remove symlinks', async () => {
    if (socatProcess) {
      socatProcess.kill()
      socatProcess = null
    }

    try {
      unlinkSync(PTY_0)
    } catch {
      /* ignore */
    }
    try {
      unlinkSync(PTY_1)
    } catch {
      /* ignore */
    }

    // Verify cleanup
    expect(existsSync(PTY_0)).toBe(false)
    expect(existsSync(PTY_1)).toBe(false)
  })
})
