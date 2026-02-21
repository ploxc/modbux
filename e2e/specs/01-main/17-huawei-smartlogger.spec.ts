/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  readRegisters,
  cell,
  scrollToRow,
  selectRegisterType,
  enableAdvancedMode,
  disableAdvancedMode,
  cleanServerState,
  setupServerConfig,
  clearData,
  setServerPanelCollapsed,
  expandAllServerPanels,
  navigateToServer
} from '../../fixtures/helpers'
import { HUAWEI_UNIT_0 } from '../../fixtures/test-data'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-huawei-smartlogger.json')

test.describe.serial('Huawei Smart Logger — comprehensive integration test', () => {
  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  // ─── Collapse empty panels ────────────────────────────────────────

  test('collapse empty panels — all except holding registers', async ({ mainPage }) => {
    await setServerPanelCollapsed(mainPage, 'coils', true)
    await setServerPanelCollapsed(mainPage, 'discrete_inputs', true)
    await setServerPanelCollapsed(mainPage, 'input_registers', true)

    // Add buttons should be hidden for collapsed panels
    await expect(mainPage.getByTestId('add-coils-btn')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-discrete_inputs-btn')).not.toBeVisible()
    await expect(mainPage.getByTestId('add-input_registers-btn')).not.toBeVisible()

    // Holding registers panel should still be expanded
    await expect(mainPage.getByTestId('add-holding_registers-btn')).toBeVisible()
  })

  // ─── Server setup (manual fast mode) ─────────────────────────────-

  test('setup Huawei Smart Logger server manually (fast mode)', async ({ mainPage }) => {
    test.setTimeout(180_000) // 80 registers in fast mode needs ~2-3 min
    await setupServerConfig(mainPage, HUAWEI_UNIT_0, true)
  })

  test('verify server has all holding registers', async ({ mainPage }) => {
    const section = mainPage.getByTestId('section-holding_registers')
    // The config has 75 holding registers
    const text = await section.textContent()
    const match = text?.match(/\((\d+)\)/)
    expect(match).toBeTruthy()
    const count = Number(match![1])
    expect(count).toBeGreaterThanOrEqual(70)
  })

  // ─── Client setup ─────────────────────────────────────────────────

  test('navigate to client', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('connect to server', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  // ─── Read and verify register values ──────────────────────────────

  test('enable advanced mode for register reading', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  test('read time registers (40000-40016)', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '40000', '17')

    // Date & Time UTC (U32 at 40000)
    const hex0 = await cell(mainPage, 40000, 'hex')
    expect(hex0.length).toBeGreaterThan(0)

    // Year (U16 at 40011) should be 2025
    const year = await cell(mainPage, 40011, 'word_uint16')
    expect(year).toBe('2025')

    // Month (U16 at 40012) should be 6
    const month = await cell(mainPage, 40012, 'word_uint16')
    expect(month).toBe('6')
  })

  test('read power adjustment registers (40420-40429)', async ({ mainPage }) => {
    await readRegisters(mainPage, '40420', '10')

    // Active adjustment % (U16 at 40428) = 990
    const pct = await cell(mainPage, 40428, 'word_uint16')
    expect(pct).toBe('990')

    // Power Factor (I16 at 40429) = 30000
    const pf = await cell(mainPage, 40429, 'word_int16')
    expect(pf).toBe('30000')
  })

  test('read generator registers — values in expected range', async ({ mainPage }) => {
    await readRegisters(mainPage, '40500', '1')

    // DC Current generator (I16 at 40500, range 500-520)
    const dc = await cell(mainPage, 40500, 'word_int16')
    const dcVal = Number(dc)
    expect(dcVal).toBeGreaterThanOrEqual(500)
    expect(dcVal).toBeLessThanOrEqual(520)
  })

  test('read energy registers (40560-40567)', async ({ mainPage }) => {
    await readRegisters(mainPage, '40560', '8')

    // Total energy (U32 at 40560) = 65432485
    const hex = await cell(mainPage, 40560, 'hex')
    expect(hex.length).toBeGreaterThan(0)

    // Plant status Xinjiang (U16 at 40566) = 1
    const status = await cell(mainPage, 40566, 'word_uint16')
    expect(status).toBe('1')
  })

  test('read voltage/current generators (40572-40577)', async ({ mainPage }) => {
    await readRegisters(mainPage, '40572', '6')

    // Phase A current generator (I16, range 5020-5045)
    const phaseA = await cell(mainPage, 40572, 'word_int16')
    const phaseAVal = Number(phaseA)
    expect(phaseAVal).toBeGreaterThanOrEqual(5020)
    expect(phaseAVal).toBeLessThanOrEqual(5045)

    // Voltage AB generator (U16, range 4000-4023)
    const vab = await cell(mainPage, 40575, 'word_uint16')
    const vabVal = Number(vab)
    expect(vabVal).toBeGreaterThanOrEqual(4000)
    expect(vabVal).toBeLessThanOrEqual(4023)
  })

  test('read DI status bitmap register (40700)', async ({ mainPage }) => {
    await readRegisters(mainPage, '40700', '1')

    // DI status = 37 (0b00100101: DI1, DI3, DI6 closed)
    const diStatus = await cell(mainPage, 40700, 'word_uint16')
    expect(diStatus).toBe('37')
  })

  test('read alarm bitmap registers (50000-50002)', async ({ mainPage }) => {
    await readRegisters(mainPage, '50000', '3')

    // Alarm Info 1 = 2048 (bit 11 set: Abnormal Reactive Schedule)
    const alarm1 = await cell(mainPage, 50000, 'word_uint16')
    expect(alarm1).toBe('2048')

    // Alarm Info 2 = 8 (bit 3 set: Device Address Conflict)
    const alarm2 = await cell(mainPage, 50001, 'word_uint16')
    expect(alarm2).toBe('8')

    // Alarm Info 3 = 0 (no alarms)
    const alarm3 = await cell(mainPage, 50002, 'word_uint16')
    expect(alarm3).toBe('0')
  })

  test('read public registers (65521-65534)', async ({ mainPage }) => {
    await readRegisters(mainPage, '65521', '14')

    // Device list change number = 5
    const changeNum = await cell(mainPage, 65521, 'word_uint16')
    expect(changeNum).toBe('5')

    // Device connection status = 45057 (0xB001 = Online)
    const connStatus = await cell(mainPage, 65534, 'word_uint16')
    expect(connStatus).toBe('45057')
  })

  // ─── Load client config ────────────────────────────────────────────

  test('disable advanced mode for config view', async ({ mainPage }) => {
    await disableAdvancedMode(mainPage)
  })

  test('load Huawei client config', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CLIENT_CONFIG)
    await mainPage.waitForTimeout(1000)

    // Config name should be set
    const nameInput = mainPage.getByTestId('client-config-name-input').locator('input')
    await expect(nameInput).toHaveValue('Huawei Smart Logger')
  })

  test('view config shows all configured registers', async ({ mainPage }) => {
    await mainPage.getByTestId('view-config-btn').click()
    await mainPage.waitForTimeout(500)

    // DataGrid virtualizes rows — only visible ones are in DOM
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(10)

    // Verify specific configured address is present
    const row40000 = mainPage.locator('.MuiDataGrid-row[data-id="40000"]')
    await expect(row40000).toBeVisible()
  })

  test('verify data types in grid config view', async ({ mainPage }) => {
    const grid = mainPage.locator('.MuiDataGrid-root')

    // Data types visible in the top portion of the grid
    await expect(grid).toContainText('UINT16', { timeout: 3000 })
    await expect(grid).toContainText('INT16')
    await expect(grid).toContainText('UINT32')
    await expect(grid).toContainText('INT32')
    await expect(grid).toContainText('UINT64')

    // Scroll to a UTF8 row (40713) to render it
    await scrollToRow(mainPage, 40713)
    await expect(grid).toContainText('UTF8')
  })

  test('verify scaling factors in grid', async ({ mainPage }) => {
    // Scroll back to top after UTF8 test scrolled to bottom
    const scroller = mainPage.locator('.MuiDataGrid-virtualScroller')
    await scroller.evaluate((el) => (el.scrollTop = 0))
    await mainPage.waitForTimeout(300)

    // Active Adjustment at 40420 has scalingFactor 0.1
    const sf = await cell(mainPage, 40420, 'scalingFactor')
    expect(sf).toBe('0.1')

    // Input Power at 40521 has scalingFactor 0.001
    const sf2 = await cell(mainPage, 40521, 'scalingFactor')
    expect(sf2).toBe('0.001')
  })

  test('verify comments in grid', async ({ mainPage }) => {
    const comment = await cell(mainPage, 40429, 'comment')
    expect(comment).toContain('Power Factor')
  })

  // ─── Read Configuration mode ──────────────────────────────────────

  test('re-enable advanced mode for read config tests', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  test('read config button is enabled with client config loaded', async ({ mainPage }) => {
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await expect(btn).toBeEnabled()
  })

  test('read configuration reads only configured registers', async ({ mainPage }) => {
    // Clear the grid first
    await clearData(mainPage)

    // Enable read configuration mode
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await btn.click()
    await expect(btn).toHaveClass(/Mui-selected/)

    // Trigger a read — should read configured registers
    await mainPage.getByTestId('read-btn').click()
    await mainPage.waitForTimeout(3000)

    // Grid should have rows for configured addresses
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)

    // A configured register should be readable
    const hex = await cell(mainPage, 40428, 'hex')
    expect(hex.length).toBeGreaterThan(0)
  })

  test('read config shows correct values for fixed registers', async ({ mainPage }) => {
    // Year at 40011 = 2025
    const year = await cell(mainPage, 40011, 'word_uint16')
    expect(year).toBe('2025')

    // Active adjustment % at 40428 = 990
    const pct = await cell(mainPage, 40428, 'word_uint16')
    expect(pct).toBe('990')
  })

  test('read config shows correct values for generator registers', async ({ mainPage }) => {
    // DC Current at 40500 should be in range 500-520
    const dc = await cell(mainPage, 40500, 'word_int16')
    const dcVal = Number(dc)
    expect(dcVal).toBeGreaterThanOrEqual(500)
    expect(dcVal).toBeLessThanOrEqual(520)
  })

  test('disable read configuration mode', async ({ mainPage }) => {
    const btn = mainPage.getByTestId('reg-read-config-btn')
    await btn.click()
    await expect(btn).not.toHaveClass(/Mui-selected/)
  })

  // ─── Disconnect and dummy data ─────────────────────────────────────

  test('disconnect from server', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })

  test('load dummy data when disconnected', async ({ mainPage }) => {
    await mainPage.getByTestId('menu-btn').click()
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.getByTestId('load-dummy-data-btn').click()
    await mainPage.waitForTimeout(500)

    // Grid should have dummy data
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  test('dummy data shows hex values in first row', async ({ mainPage }) => {
    // First row may not be at address 0 — use the first rendered row
    const firstRow = mainPage.locator('.MuiDataGrid-row').first()
    const hex = await firstRow.locator('[data-field="hex"]').textContent()
    expect((hex ?? '').trim().length).toBeGreaterThan(0)
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('clear client config', async ({ mainPage }) => {
    await mainPage.getByTestId('clear-config-btn').click()

    const viewBtn = mainPage.getByTestId('view-config-btn')
    await expect(viewBtn).toBeDisabled()
  })

  test('expand all server panels for clean state', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await expandAllServerPanels(mainPage)
  })
})
