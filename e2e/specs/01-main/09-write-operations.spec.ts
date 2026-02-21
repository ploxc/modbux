import { test, expect } from '../../fixtures/electron-app'
import {
  selectRegisterType,
  cell,
  addRegister,
  addCoils,
  readRegisters,
  clearData,
  connectClient,
  disconnectClient,
  navigateToClient,
  enableAdvancedMode,
  cleanServerState,
  selectDataType,
  writeRegister,
  writeCoil
} from '../../fixtures/helpers'

test.describe.serial('Write Operations', () => {
  // ─── Setup: clean state and configure writable registers ───────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('setup server with writable registers', async ({ mainPage }) => {
    // Add holding registers
    await addRegister(
      mainPage,
      {
        registerType: 'holding_registers',
        address: 0,
        dataType: 'INT16',
        mode: 'fixed',
        value: '100',
        comment: 'write test int16',
        next: true
      },
      false,
      true
    )
    await addRegister(
      mainPage,
      {
        registerType: 'holding_registers',
        address: 1,
        dataType: 'UINT16',
        mode: 'fixed',
        value: '200',
        comment: 'write test uint16',
        next: true
      },
      true,
      true
    )
    await addRegister(
      mainPage,
      {
        registerType: 'holding_registers',
        address: 2,
        dataType: 'INT32',
        mode: 'fixed',
        value: '1000',
        comment: 'write test int32',
        next: true
      },
      true,
      true
    )
    await addRegister(
      mainPage,
      {
        registerType: 'holding_registers',
        address: 4,
        dataType: 'FLOAT',
        mode: 'fixed',
        value: '1.5',
        comment: 'write test float'
      },
      true,
      true
    )

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(4)')

    // Add coils
    await addCoils(mainPage, 0, true)
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')
  })

  test('navigate to client and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  // ─── Holding Register writes ───────────────────────────────────────

  test.describe.serial('Holding Register writes', () => {
    test('read holding registers', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Holding Registers')
      await readRegisters(mainPage, '0', '6')
    })

    test('write INT16 via FC6 (single register)', async ({ mainPage }) => {
      await writeRegister(mainPage, 0, '555', 'fc6')
    })

    test('verify INT16 written value', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '1')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('555')
      await clearData(mainPage)
    })

    test('write UINT16 via FC16 (multiple registers)', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '6')
      await writeRegister(mainPage, 1, '999', 'fc16')
    })

    test('verify UINT16 written value', async ({ mainPage }) => {
      await readRegisters(mainPage, '1', '1')
      expect(await cell(mainPage, 1, 'word_uint16')).toBe('999')
      await clearData(mainPage)
    })

    test('write INT32 via FC16', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '6')
      await writeRegister(mainPage, 2, '50000', 'fc16', 'INT32')
    })

    test('verify INT32 written value', async ({ mainPage }) => {
      await readRegisters(mainPage, '2', '2')
      expect(await cell(mainPage, 2, 'word_int32')).toBe('50000')
      await clearData(mainPage)
    })

    test('write FLOAT via FC16', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '6')
      await writeRegister(mainPage, 4, '3.14', 'fc16', 'FLOAT')
    })

    test('verify FLOAT written value', async ({ mainPage }) => {
      await readRegisters(mainPage, '4', '2')
      const val = await cell(mainPage, 4, 'word_float')
      expect(val).toContain('3.14')
      await clearData(mainPage)
    })

    test('write negative INT16 value', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '6')
      await writeRegister(mainPage, 0, '-100', 'fc6', 'INT16')
    })

    test('verify negative INT16 written value', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '1')
      expect(await cell(mainPage, 0, 'word_int16')).toBe('-100')
      await clearData(mainPage)
    })
  })

  // ─── Coil writes ───────────────────────────────────────────────────

  test.describe.serial('Coil writes', () => {
    test('read coils', async ({ mainPage }) => {
      await selectRegisterType(mainPage, 'Coils')
      await readRegisters(mainPage, '0', '8')
    })

    test('write coil TRUE via FC5', async ({ mainPage }) => {
      await writeCoil(mainPage, 0, true)
    })

    test('verify coil written TRUE', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '8')
      expect(await cell(mainPage, 0, 'bit')).toBe('TRUE')
      await clearData(mainPage)
    })

    test('write coil back to FALSE via FC5', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '8')
      await writeCoil(mainPage, 0, false)
    })

    test('verify coil written FALSE', async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '8')
      expect(await cell(mainPage, 0, 'bit')).toBe('FALSE')
      await clearData(mainPage)
    })
  })

  // ─── Cleanup ───────────────────────────────────────────────────────

  test('disconnect', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
