import { test, expect } from '../../fixtures/electron-app'
import {
  selectRegisterType,
  cell,
  readRegisters,
  clearData,
  setupServerConfig,
  connectClient,
  disconnectClient,
  navigateToServer,
  navigateToClient,
  enableAdvancedMode,
  cleanServerState
} from '../../fixtures/helpers'
import { SERVER_1_UNIT_0, SERVER_1_UNIT_1, SERVER_2_UNIT_0 } from '../../fixtures/test-data'

test.describe.serial('Client-Server Integration', () => {
  let server2Port: string

  // ─── Setup: clean state and configure both servers ─────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('configure server 1, unit 0', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_0, true)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(12)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(3)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  test('configure server 1, unit 1', async ({ mainPage }) => {
    await setupServerConfig(mainPage, SERVER_1_UNIT_1, true)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
  })

  test('add second server and configure unit 0', async ({ mainPage }) => {
    await mainPage.getByTestId('add-server-btn').click()
    await mainPage.waitForTimeout(500)

    const toggleButtons = mainPage.locator('[data-testid^="select-server-"]')
    expect(await toggleButtons.count()).toBe(2)

    await setupServerConfig(mainPage, SERVER_2_UNIT_0, true)
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

    test('read holding registers 0-22', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '0', '23')
    })

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

    test('verify generator at address 22 is in range 0-1000', async ({ mainPage }) => {
      const hex = await cell(mainPage, 22, 'hex')
      const decVal = parseInt(hex, 16)
      expect(decVal).toBeGreaterThanOrEqual(0)
      expect(decVal).toBeLessThanOrEqual(1000)
    })

    test('clear holding data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    test('read input registers 0-3', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Input Registers')
      await readRegisters(mainPage, '0', '4')
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

    test('verify generator at input address 3 is in range 100-500', async ({ mainPage }) => {
      const hex = await cell(mainPage, 3, 'hex')
      const decVal = parseInt(hex, 16)
      expect(decVal).toBeGreaterThanOrEqual(100)
      expect(decVal).toBeLessThanOrEqual(500)
    })

    test('clear input data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    test('read coils 0-15', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Coils')
      await readRegisters(mainPage, '0', '16')
    })

    test('verify coil 0 is FALSE', async ({ mainPage }) => {
      expect(await cell(mainPage, 0, 'bit')).toBe('FALSE')
    })

    test('verify coil 5 is TRUE', async ({ mainPage }) => {
      expect(await cell(mainPage, 5, 'bit')).toBe('TRUE')
    })

    test('verify remaining coils are FALSE', async ({ mainPage }) => {
      for (const addr of [1, 2, 3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
        expect(await cell(mainPage, addr, 'bit')).toBe('FALSE')
      }
    })

    test('clear coils data', async ({ mainPage }) => {
      await clearData(mainPage)
    })

    test('read discrete inputs 0-7', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Discrete Inputs')
      await readRegisters(mainPage, '0', '8')
    })

    test('verify DI 3 is TRUE', async ({ mainPage }) => {
      expect(await cell(mainPage, 3, 'bit')).toBe('TRUE')
    })

    test('verify remaining DIs are FALSE', async ({ mainPage }) => {
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
