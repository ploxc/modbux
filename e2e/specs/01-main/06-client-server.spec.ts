import { test, expect } from '../../fixtures/electron-app'
import {
  selectRegisterType,
  cell,
  readRegisters,
  clearData,
  loadServerConfig,
  connectClient,
  disconnectClient,
  navigateToServer,
  navigateToClient,
  enableAdvancedMode,
  cleanServerState,
  selectUnitId
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')
const SERVER_2_CONFIG = resolve(CONFIG_DIR, 'server-2.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-server1-unit0.json')

test.describe.serial('Client-Server Integration', () => {
  let server2Port: string

  // ─── Setup: load server config and configure second server ───────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server 1 config via file (all data types, 2 units)', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)

    // Verify config loaded: unit 0 holding registers
    // 12 entries: int16, uint16, int32, uint32, float, int64, uint64, double, utf8, generator, unix, datetime
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  test('verify unit 1 loaded from config', async ({ mainPage }) => {
    await selectUnitId(mainPage, '1')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
    await selectUnitId(mainPage, '0')
  })

  test('add second server and configure unit 0', async ({ mainPage }) => {
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)

    const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
    expect(await toggleButtons.count()).toBe(2)

    await loadServerConfig(mainPage, SERVER_2_CONFIG)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
  })

  test('navigate to client and enable advanced mode', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
  })

  // ─── Advanced mode checkboxes visibility ───────────────────────────

  test('advanced mode checkboxes hidden on Coils', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Coils')
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('advanced-mode-checkbox')).not.toBeVisible()
    await expect(mainPage.getByTestId('show-64bit-checkbox')).not.toBeVisible()
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('advanced mode checkboxes hidden on Discrete Inputs', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await mainPage.getByTestId('menu-btn').click()
    await mainPage.waitForTimeout(300)
    await expect(mainPage.getByTestId('advanced-mode-checkbox')).not.toBeVisible()
    await expect(mainPage.getByTestId('show-64bit-checkbox')).not.toBeVisible()
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  // ─── Server 1, Unit 0 reads ────────────────────────────────────────

  test.describe.serial('Server 1, Unit 0 reads', () => {
    test('connect to server 1, unit 0', async ({ mainPage }) => {
      await connectClient(mainPage, '127.0.0.1', '502', '0')
    })

    test('read holding registers 0-32', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '0', '32')
    })

    // ─── Hex + word column verification (raw data transfer) ────────

    test('verify INT16 at address 0 = -100', async ({ mainPage }) => {
      expect(await cell(mainPage, 0, 'hex')).toBe('FF9C')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('-100')
    })

    test('verify UINT16 at address 1 = 500', async ({ mainPage }) => {
      expect(await cell(mainPage, 1, 'hex')).toBe('01F4')
      expect(await cell(mainPage, 1, 'word_uint16')).toBe('500')
    })

    test('verify INT32 at address 2 = -70000', async ({ mainPage }) => {
      expect(await cell(mainPage, 2, 'hex')).toBe('FFFE')
      expect(await cell(mainPage, 3, 'hex')).toBe('EE90')
      expect(await cell(mainPage, 2, 'word_int32')).toBe('-70000')
    })

    test('verify UINT32 at address 4 = 100000', async ({ mainPage }) => {
      expect(await cell(mainPage, 4, 'hex')).toBe('0001')
      expect(await cell(mainPage, 5, 'hex')).toBe('86A0')
      expect(await cell(mainPage, 4, 'word_uint32')).toBe('100000')
    })

    test('verify FLOAT at address 6 ≈ 3.14', async ({ mainPage }) => {
      expect(await cell(mainPage, 6, 'hex')).toBe('4048')
      const val = await cell(mainPage, 6, 'word_float')
      expect(val).toContain('3.14')
    })

    test('verify INT64 at address 8 = -1000000', async ({ mainPage }) => {
      expect(await cell(mainPage, 8, 'word_int64')).toBe('-1000000')
    })

    test('verify UINT64 at address 12 = 2000000', async ({ mainPage }) => {
      expect(await cell(mainPage, 12, 'word_uint64')).toBe('2000000')
    })

    test('verify DOUBLE at address 16 ≈ 2.718', async ({ mainPage }) => {
      const val = await cell(mainPage, 16, 'word_double')
      expect(val).toContain('2.718')
    })

    // ─── UTF-8 at address 20 (3 registers, length 5) ────────────────

    test('verify UTF-8 "Hello" at address 20 — hex encoded', async ({ mainPage }) => {
      // "Hello" big-endian: 'H'=0x48 'e'=0x65 → 0x4865, 'l'=0x6C 'l'=0x6C → 0x6C6C, 'o'=0x6F '\0'=0x00 → 0x6F00
      expect(await cell(mainPage, 20, 'hex')).toBe('4865')
      expect(await cell(mainPage, 21, 'hex')).toBe('6C6C')
      expect(await cell(mainPage, 22, 'hex')).toBe('6F00')
    })

    // ─── UNIX timestamp at address 26 (2 registers) ────────────────

    test('verify UNIX 1700000000 at address 26 — hex 6553 F100', async ({ mainPage }) => {
      expect(await cell(mainPage, 26, 'hex')).toBe('6553')
      expect(await cell(mainPage, 27, 'hex')).toBe('F100')
    })

    // ─── DATETIME at address 28 (4 registers, IEC 870-5) ───────────
    // Note: datetime at address 28 is a generator, hex values change each read

    // ─── Value column with client config mapping ───────────────────
    // Load client config that maps datatypes + scaling, verify the
    // decoded values in the 'value' column (full end-to-end chain)

    test('load client config and re-read for value column verification', async ({ mainPage }) => {
      const fileInput = mainPage.getByTestId('load-config-file-input')
      await fileInput.setInputFiles(CLIENT_CONFIG)
      await mainPage.waitForTimeout(1000)
      // Re-read so the value column can compute decoded values with the new mapping
      await readRegisters(mainPage, '0', '32')
    })

    test('value column: INT16 at address 0 = -100', async ({ mainPage }) => {
      expect(await cell(mainPage, 0, 'value')).toBe('-100')
    })

    test('value column: UINT16 at address 1 with scaling 0.1 = 50', async ({ mainPage }) => {
      // Server value is 500, scaling factor 0.1 → displayed as 50
      expect(await cell(mainPage, 1, 'value')).toBe('50')
    })

    test('value column: INT32 at address 2 = -70000', async ({ mainPage }) => {
      expect(await cell(mainPage, 2, 'value')).toBe('-70000')
    })

    test('value column: UINT32 at address 4 = 100000', async ({ mainPage }) => {
      expect(await cell(mainPage, 4, 'value')).toBe('100000')
    })

    test('value column: FLOAT at address 6 ≈ 3.14', async ({ mainPage }) => {
      const val = await cell(mainPage, 6, 'value')
      expect(val).toContain('3.14')
    })

    test('value column: INT64 at address 8 = -1000000', async ({ mainPage }) => {
      expect(await cell(mainPage, 8, 'value')).toBe('-1000000')
    })

    test('value column: UINT64 at address 12 = 2000000', async ({ mainPage }) => {
      expect(await cell(mainPage, 12, 'value')).toBe('2000000')
    })

    test('value column: DOUBLE at address 16 ≈ 2.718', async ({ mainPage }) => {
      const val = await cell(mainPage, 16, 'value')
      expect(val).toContain('2.718')
    })

    test('value column: UTF-8 at address 20 = "Hello"', async ({ mainPage }) => {
      const val = await cell(mainPage, 20, 'value')
      expect(val).toContain('Hello')
    })

    test('value column: UNIX at address 26 = 2023/11/14 22:13:20', async ({ mainPage }) => {
      // 1700000000 seconds since epoch = 2023/11/14 22:13:20 UTC
      const val = await cell(mainPage, 26, 'value')
      expect(val).toBe('2023/11/14 22:13:20')
    })

    test('value column: DATETIME at address 28 shows current time', async ({ mainPage }) => {
      // Datetime generator produces current timestamps
      const val = await cell(mainPage, 28, 'value')
      expect(val.length).toBeGreaterThan(0)
    })

    test('clear holding data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    // ─── Input registers ───────────────────────────────────────────

    test('read input registers 0-2', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Input Registers')
      await readRegisters(mainPage, '0', '3')
    })

    test('verify INT16 at input address 0 = 200', async ({ mainPage }) => {
      expect(await cell(mainPage, 0, 'hex')).toBe('00C8')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('200')
    })

    test('verify FLOAT at input address 1 ≈ 9.81', async ({ mainPage }) => {
      expect(await cell(mainPage, 1, 'hex')).toBe('411C')
      const val = await cell(mainPage, 1, 'word_float')
      expect(val).toContain('9.81')
    })

    // Value column (client mapping already loaded)

    test('value column: input INT16 at address 0 = 200', async ({ mainPage }) => {
      expect(await cell(mainPage, 0, 'value')).toBe('200')
    })

    test('value column: input FLOAT at address 1 ≈ 9.81', async ({ mainPage }) => {
      const val = await cell(mainPage, 1, 'value')
      expect(val).toContain('9.81')
    })

    test('clear input data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    // ─── Coils ─────────────────────────────────────────────────────

    test('read coils 0-15', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Coils')
      await readRegisters(mainPage, '0', '16')
    })

    test('verify coil 5 is TRUE, rest FALSE', async ({ mainPage }) => {
      expect(await cell(mainPage, 5, 'bit')).toBe('TRUE')
      for (const addr of [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
        expect(await cell(mainPage, addr, 'bit')).toBe('FALSE')
      }
    })

    test('clear coils data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    // ─── Discrete inputs ───────────────────────────────────────────

    test('read discrete inputs 0-7', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Discrete Inputs')
      await readRegisters(mainPage, '0', '8')
    })

    test('verify DI 3 is TRUE, rest FALSE', async ({ mainPage }) => {
      expect(await cell(mainPage, 3, 'bit')).toBe('TRUE')
      for (const addr of [0, 1, 2, 4, 5, 6, 7]) {
        expect(await cell(mainPage, addr, 'bit')).toBe('FALSE')
      }
    })

    test('clear discrete inputs data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    test('disconnect from server 1, unit 0', async ({ mainPage }) => {
      await disconnectClient(mainPage)
    })
  })

  // ─── Server 1, Unit 1 reads ────────────────────────────────────────

  test.describe.serial('Server 1, Unit 1 reads', () => {
    test('connect to server 1, unit 1', async ({ mainPage }) => {
      await connectClient(mainPage, '127.0.0.1', '502', '1')
    })

    test('read holding register 0 = 777', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '0', '1')
      expect(await cell(mainPage, 0, 'hex')).toBe('0309')
      expect(await cell(mainPage, 0, 'word_uint16')).toBe('777')
      await clearData(mainPage)
    })

    test('read input register 0 = 888', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Input Registers')
      await readRegisters(mainPage, '0', '1')
      expect(await cell(mainPage, 0, 'hex')).toBe('0378')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('888')
      await clearData(mainPage)
    })

    test('read coils — coil 2 is TRUE, rest FALSE', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Coils')
      await readRegisters(mainPage, '0', '8')
      expect(await cell(mainPage, 2, 'bit')).toBe('TRUE')
      for (const addr of [0, 1, 3, 4, 5, 6, 7]) {
        expect(await cell(mainPage, addr, 'bit')).toBe('FALSE')
      }
      await clearData(mainPage)
    })

    test('disconnect from server 1, unit 1', async ({ mainPage }) => {
      await disconnectClient(mainPage)
    })
  })

  // ─── Server 2, Unit 0 reads ────────────────────────────────────────

  test.describe.serial('Server 2, Unit 0 reads', () => {
    test('get server 2 port', async ({ mainPage }) => {
      await navigateToServer(mainPage)

      const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
      const secondServer = toggleButtons.nth(1)
      await secondServer.click()
      await mainPage.waitForTimeout(300)

      const portInput = mainPage.getByTestId('server-port-input').locator('input')
      server2Port = await portInput.inputValue()

      await navigateToClient(mainPage)
    })

    test('connect to server 2, unit 0', async ({ mainPage }) => {
      await connectClient(mainPage, '127.0.0.1', server2Port, '0')
    })

    test('read holding register 0 = 42', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '0', '2')
      expect(await cell(mainPage, 0, 'hex')).toBe('002A')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('42')
    })

    test('verify generator at address 1 is in range 10-90', async ({ mainPage }) => {
      const hex = await cell(mainPage, 1, 'hex')
      const decVal = parseInt(hex, 16)
      expect(decVal).toBeGreaterThanOrEqual(10)
      expect(decVal).toBeLessThanOrEqual(90)
      await clearData(mainPage)
    })

    test('read coils — coil 0 is TRUE, rest FALSE', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Coils')
      await readRegisters(mainPage, '0', '8')
      expect(await cell(mainPage, 0, 'bit')).toBe('TRUE')
      for (const addr of [1, 2, 3, 4, 5, 6, 7]) {
        expect(await cell(mainPage, addr, 'bit')).toBe('FALSE')
      }
      await clearData(mainPage)
    })

    test('disconnect from server 2', async ({ mainPage }) => {
      await disconnectClient(mainPage)
    })
  })
})
