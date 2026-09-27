/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  openClientMenu,
  navigateToClient,
  connectClient,
  disconnectClient,
  readRegisters,
  selectRegisterType,
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  loadServerConfig,
  expectCell,
  expectColumn,
  openColumnMenu,
  clearClientConfig,
  loadClientConfig,
  setBitWidth
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-integration.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-basic.json')

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Client toolbar — display options and utilities', () => {
  // ─── Setup ──────────────────────────────────────────────────────────

  test('clean and load server config', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('navigate to client, load a mapping and connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('read registers', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await readRegisters(mainPage, '0', '40')
  })

  // ─── 32 and 64 bit columns ────────────────────────────────

  test('with 32 and 64 off no value columns are visible', async ({ mainPage }) => {
    await setBitWidth(mainPage, '32', false)
    await setBitWidth(mainPage, '64', false)

    await expectColumn(mainPage, 'word_int16', false)
    await expectColumn(mainPage, 'word_uint16', false)
    await expectColumn(mainPage, 'word_float', false)
  })

  test('32 shows the 16 and 32 bit value columns', async ({ mainPage }) => {
    await setBitWidth(mainPage, '32', true)

    await expectColumn(mainPage, 'word_int16', true)
    await expectColumn(mainPage, 'word_uint16', true)
    await expectColumn(mainPage, 'word_int32', true)
    await expectColumn(mainPage, 'word_uint32', true)
    await expectColumn(mainPage, 'word_float', true)
    await expectColumn(mainPage, 'word_int64', false)
  })

  test('64 shows int64, uint64, double columns', async ({ mainPage }) => {
    await setBitWidth(mainPage, '64', true)

    await expectColumn(mainPage, 'word_int64', true)
    await expectColumn(mainPage, 'word_uint64', true)
    await expectColumn(mainPage, 'word_double', true)
  })

  test('32 off leaves the 64 bit columns', async ({ mainPage }) => {
    await setBitWidth(mainPage, '32', false)

    await expectColumn(mainPage, 'word_int16', false)
    await expectColumn(mainPage, 'word_float', false)
    await expectColumn(mainPage, 'word_int64', true)

    await setBitWidth(mainPage, '64', false)
    await expectColumn(mainPage, 'word_int64', false)
  })

  test('re-enable advanced mode with 64-bit for remaining tests', async ({ mainPage }) => {
    await enableAdvancedMode(mainPage)
  })

  // ─── Address base ───────────────────────────────────────────────────

  test('address base 0 is selected by default', async ({ mainPage }) => {
    const base0Btn = mainPage.getByTestId('reg-base-0-btn')
    await expect(base0Btn).toHaveClass(/Mui-selected/)

    // First row address should show "0"
    await expectCell(mainPage, 0, 'id', '0')
  })

  test('address base 1 shifts grid addresses and input by 1', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('reg-address-input').locator('input')

    // Capture address input value with base 0
    const inputBase0 = await addressInput.inputValue()

    await mainPage.getByTestId('reg-base-1-btn').click()

    const base1Btn = mainPage.getByTestId('reg-base-1-btn')
    await expect(base1Btn).toHaveClass(/Mui-selected/)

    // Grid address should now show "1"
    await expectCell(mainPage, 0, 'id', '1')

    // Address input should also shift by +1
    const inputBase1 = await addressInput.inputValue()
    expect(Number(inputBase1)).toBe(Number(inputBase0) + 1)

    // Reset back to base 0
    await mainPage.getByTestId('reg-base-0-btn').click()
    await mainPage.waitForTimeout(300)

    await expectCell(mainPage, 0, 'id', '0')

    const inputReset = await addressInput.inputValue()
    expect(inputReset).toBe(inputBase0)
  })

  // ─── Grid clearing behavior ────────────────────────────────────────

  test('base change does not clear grid', async ({ mainPage }) => {
    // Grid should have data from earlier read
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)

    // Switch to base 1
    await mainPage.getByTestId('reg-base-1-btn').click()
    await mainPage.waitForTimeout(300)

    // The grid virtualises, so the rendered row count follows the layout
    // rather than the data: what is asserted is that rows are still there.
    await expectCell(mainPage, 0, 'id', '1')

    // Switch back to base 0
    await mainPage.getByTestId('reg-base-0-btn').click()
    await mainPage.waitForTimeout(300)

    await expectCell(mainPage, 0, 'id', '0')
  })

  test('address change clears grid', async ({ mainPage }) => {
    const addressInput = mainPage.getByTestId('reg-address-input').locator('input')
    await addressInput.fill('100')
    await mainPage.waitForTimeout(300)

    // Grid should be empty after address change
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)

    // Re-read to restore data for subsequent tests
    await addressInput.fill('0')
    await readRegisters(mainPage, '0', '40')
  })

  test('length change clears grid', async ({ mainPage }) => {
    const lengthInput = mainPage.getByTestId('reg-length-input').locator('input')
    await lengthInput.fill('20')
    await mainPage.waitForTimeout(300)

    // Grid should be empty after length change
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)

    // Re-read to restore data for subsequent tests
    await readRegisters(mainPage, '0', '40')
  })

  test('a cleared length greys Read and Poll until it names a register again', async ({
    mainPage
  }) => {
    const lengthInput = mainPage.getByTestId('reg-length-input').locator('input')
    await lengthInput.fill('')

    await expect(mainPage.getByTestId('read-btn')).toBeDisabled()
    await expect(mainPage.getByTestId('poll-btn')).toBeDisabled()

    await lengthInput.fill('40')
    await expect(mainPage.getByTestId('read-btn')).toBeEnabled()
    await expect(mainPage.getByTestId('poll-btn')).toBeEnabled()
    await readRegisters(mainPage, '0', '40')
  })

  // ─── Raw display toggle ─────────────────────────────────────────────

  test('raw button toggles raw display mode', async ({ mainPage }) => {
    const rawBtn = mainPage.getByTestId('raw-btn')

    // Ensure raw mode is off before testing toggle. MUI v9 split composite
    // class names, so the on-state is `contained` plus `colorWarning` as two
    // separate classes instead of a single `containedWarning`.
    const classes = await rawBtn.getAttribute('class')
    if (classes?.includes('MuiButton-colorWarning')) {
      await rawBtn.click()
    }

    await expect(rawBtn).not.toHaveClass(/MuiButton-colorWarning/)

    // Toggle raw mode on
    await rawBtn.click()
    await expect(rawBtn).toHaveClass(/MuiButton-contained/)
    await expect(rawBtn).toHaveClass(/MuiButton-colorWarning/)

    // Toggle raw mode off
    await rawBtn.click()
    await expect(rawBtn).not.toHaveClass(/MuiButton-colorWarning/)
  })

  // ─── Transaction log ────────────────────────────────────────────────

  test('the log bar opens and closes the log', async ({ mainPage }) => {
    const logBtn = mainPage.getByTestId('transaction-log-toggle')
    const logPanel = mainPage.getByTestId('transaction-log-panel')

    await logBtn.click()

    await expect(logBtn).toHaveAttribute('aria-expanded', 'true')
    await expect(logPanel).toBeVisible()

    // Click again to hide
    await logBtn.click()
    await expect(logBtn).toHaveAttribute('aria-expanded', 'false')
    await expect(logPanel).not.toBeVisible()
  })

  // modbus-serial files `nextDataAddress` on two of its twelve transaction
  // records, so FC3, FC4 and FC6 carried an address and FC1, FC2, FC5, FC15 and
  // FC16 did not: the Addr cell was blank for every coil read, every discrete
  // input read and every write Modbux sends.
  test('the log shows the address of a coil read, which FC1 files none for', async ({
    mainPage
  }) => {
    await selectRegisterType(mainPage, 'Coils')
    await mainPage.getByTestId('transaction-log-toggle').click()

    await readRegisters(mainPage, '4', '2')

    const logPanel = mainPage.getByTestId('transaction-log-panel')
    const addressCell = logPanel
      .locator('.MuiDataGrid-row')
      .first()
      .locator('[data-field="address"]')
    await expect(addressCell).toHaveText('4', { timeout: 5000 })

    await mainPage.getByTestId('transaction-log-toggle').click()
    await selectRegisterType(mainPage, 'Holding Registers')
  })

  // ─── Register read config toggle ──────────────────────────────────

  for (const regType of ['Holding Registers', 'Input Registers'] as const) {
    test(`[${regType}] read config: clear config → button disabled`, async ({ mainPage }) => {
      await selectRegisterType(mainPage, regType)

      // The first pass of this loop runs against the mapping the setup
      // loaded, and the second against what the first cleared. Keep it
      // leaves that mapping where it was, which the dialog coming up a second
      // time is what says.
      const asks = regType === 'Holding Registers'

      if (asks) {
        await mainPage.getByTestId('clear-config-btn').click()
        await mainPage.getByTestId('clear-config-cancel-btn').click()
        await expect(mainPage.getByTestId('clear-config-confirm-btn')).toHaveCount(0)
      }

      await clearClientConfig(mainPage, asks)

      const btn = mainPage.getByTestId('reg-read-config-btn')
      await expect(btn).toBeDisabled()
    })

    test(`[${regType}] read config: set data type → button enabled`, async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '10')

      const row = mainPage.locator('.MuiDataGrid-row').first()
      await row.locator('[data-field="dataType"]').dblclick()
      await mainPage.waitForTimeout(300)
      await mainPage.getByRole('option', { name: 'INT16', exact: true }).click()
      await mainPage.keyboard.press('Enter')

      await expect(mainPage.getByTestId('reg-read-config-btn')).toBeEnabled()
    })

    test(`[${regType}] read config: toggle on and off`, async ({ mainPage }) => {
      await enableReadConfiguration(mainPage)
      await disableReadConfiguration(mainPage)
    })

    test(`[${regType}] read config: remove data type → button disabled`, async ({ mainPage }) => {
      await enableReadConfiguration(mainPage)
      const btn = mainPage.getByTestId('reg-read-config-btn')

      const row = mainPage.locator('.MuiDataGrid-row').first()
      await row.locator('[data-field="dataType"]').dblclick()
      await mainPage.waitForTimeout(300)
      await mainPage.getByRole('option', { name: 'NONE' }).click()
      await mainPage.keyboard.press('Enter')

      await expect(btn).toBeDisabled()
    })
  }

  // ─── Coils & Discrete Inputs — toolbar differences ─────────────────

  for (const regType of ['Coils', 'Discrete Inputs'] as const) {
    test(`[${regType}] no raw button visible`, async ({ mainPage }) => {
      await selectRegisterType(mainPage, regType)

      await expect(mainPage.getByTestId('raw-btn')).not.toBeVisible()
    })

    test(`[${regType}] no endian toggle visible`, async ({ mainPage }) => {
      await selectRegisterType(mainPage, regType)

      await expect(mainPage.getByTestId('endian-be-btn')).not.toBeVisible()
      await expect(mainPage.getByTestId('endian-le-btn')).not.toBeVisible()
    })

    test(`[${regType}] no 32 or 64 bit buttons`, async ({ mainPage }) => {
      await expect(mainPage.getByTestId('bits-32-btn')).not.toBeVisible()
      await expect(mainPage.getByTestId('bits-64-btn')).not.toBeVisible()
    })

    test(`[${regType}] scan button says "Scan TRUE bits"`, async ({ mainPage }) => {
      await openClientMenu(mainPage)

      await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan TRUE bits')

      await mainPage.keyboard.press('Escape')
    })

    test(`[${regType}] grid shows bit column, no dataType column`, async ({ mainPage }) => {
      await readRegisters(mainPage, '0', '8')

      await expectColumn(mainPage, 'bit', true)
      await expectColumn(mainPage, 'dataType', false)
      await expectColumn(mainPage, 'hex', false)
    })
  }

  test('[Coils] write action column is visible', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Coils')
    await readRegisters(mainPage, '0', '8')

    await expectColumn(mainPage, 'actions', true)
  })

  test('[Discrete Inputs] no write action column (read-only)', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Discrete Inputs')
    await readRegisters(mainPage, '0', '8')

    await expectColumn(mainPage, 'actions', false)
  })

  // Verify 16-bit register features are back after switching
  test('[Holding Registers] endian toggle and 32/64 return', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Holding Registers')

    await expect(mainPage.getByTestId('endian-be-btn')).toBeVisible()
    await expect(mainPage.getByTestId('bits-32-btn')).toBeVisible()

    await openClientMenu(mainPage)
    await expect(mainPage.getByTestId('scan-registers-btn')).toContainText('Scan registers')
    await mainPage.keyboard.press('Escape')
  })

  // ─── Load dummy data ────────────────────────────────────────────────

  test('load dummy data button is disabled when connected', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeDisabled()
    await mainPage.keyboard.press('Escape')
  })

  test('disconnect clears grid and enables dummy data', async ({ mainPage }) => {
    await disconnectClient(mainPage)
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')

    // Grid should be empty after disconnect
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBe(0)
  })

  test('load dummy data button is enabled when disconnected', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.keyboard.press('Escape')
  })

  test('load dummy data populates register grid', async ({ mainPage }) => {
    // Wait for disconnected state before opening menu
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Connect')

    await expect(mainPage.getByTestId('load-dummy-data-btn')).toBeEnabled()
    await mainPage.getByTestId('load-dummy-data-btn').click()
    await mainPage.waitForTimeout(500)

    // Verify grid has data
    const rowCount = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  // ─── Column filters ─────────────────────────────────────────────────

  test('clear filters button is hidden while nothing is filtered', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('clear-filters-btn')).not.toBeVisible()
  })

  test('filtering on hex reveals the clear filters button', async ({ mainPage }) => {
    const rowsBefore = await mainPage.locator('.MuiDataGrid-row').count()
    expect(rowsBefore).toBeGreaterThan(1)

    await openColumnMenu(mainPage, 'hex')
    await mainPage
      .locator('.MuiDataGrid-menuList')
      .getByRole('menuitem', { name: 'Filter' })
      .click()

    const valueInput = mainPage.locator('.MuiDataGrid-filterFormValueInput input')
    await expect(valueInput).toBeVisible()

    // An empty filter form is not a filter yet.
    await expect(mainPage.getByTestId('clear-filters-btn')).not.toBeVisible()

    // Dummy data reads 0000 across the board, so this matches nothing and the
    // grid empties -- proof the filter reached the rows, not only the toolbar.
    await valueInput.fill('ffff')
    await expect(mainPage.getByTestId('clear-filters-btn')).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await expect(mainPage.locator('.MuiDataGrid-row')).toHaveCount(0)
  })

  test('clearing filters restores every row', async ({ mainPage }) => {
    await mainPage.getByTestId('clear-filters-btn').click()

    await expect(mainPage.getByTestId('clear-filters-btn')).not.toBeVisible()
    expect(await mainPage.locator('.MuiDataGrid-row').count()).toBeGreaterThan(1)
  })

  // The grid's rows carry no values until a value filter asks for them, so a
  // filter on a value every row holds keeps every row rather than none.
  test('a hex filter matching every row keeps them all', async ({ mainPage }) => {
    const rowsBefore = await mainPage.locator('.MuiDataGrid-row').count()

    await openColumnMenu(mainPage, 'hex')
    await mainPage
      .locator('.MuiDataGrid-menuList')
      .getByRole('menuitem', { name: 'Filter' })
      .click()
    await mainPage.locator('.MuiDataGrid-filterFormValueInput input').fill('0000')
    await expect(mainPage.getByTestId('clear-filters-btn')).toBeVisible()
    await mainPage.keyboard.press('Escape')

    await expect(mainPage.locator('.MuiDataGrid-row')).toHaveCount(rowsBefore)

    await mainPage.getByTestId('clear-filters-btn').click()
  })

  test('address and binary columns offer no filter', async ({ mainPage }) => {
    await openColumnMenu(mainPage, 'id')
    await expect(
      mainPage.locator('.MuiDataGrid-menuList').getByRole('menuitem', { name: 'Filter' })
    ).toHaveCount(0)
    await mainPage.keyboard.press('Escape')

    // BIN's menu hides the column and offers no filter.
    await openColumnMenu(mainPage, 'bin')
    const binMenu = mainPage.locator('.MuiDataGrid-menuList')
    await expect(binMenu.getByRole('menuitem', { name: 'Hide column' })).toBeVisible()
    await expect(binMenu.getByRole('menuitem', { name: 'Filter' })).toHaveCount(0)
    await mainPage.keyboard.press('Escape')

    // Nor is it among the columns the filter panel offers, where hex is.
    await openColumnMenu(mainPage, 'hex')
    await mainPage
      .locator('.MuiDataGrid-menuList')
      .getByRole('menuitem', { name: 'Filter' })
      .click()
    const columns = mainPage.locator('.MuiDataGrid-filterFormColumnInput')
    await columns.click()
    await expect(mainPage.getByRole('option', { name: 'HEX', exact: true })).toBeVisible()
    await expect(mainPage.getByRole('option', { name: 'BIN', exact: true })).toHaveCount(0)
    await mainPage.keyboard.press('Escape')
    await mainPage.keyboard.press('Escape')
  })

  test('read configuration takes filtering away entirely', async ({ mainPage }) => {
    // Read configuration hides rows without a data type, so give one row a type
    // and keep the count as the yardstick.
    const firstRow = mainPage.locator('.MuiDataGrid-row').first()
    await firstRow.locator('[data-field="dataType"]').dblclick()
    await mainPage.waitForTimeout(300)
    await mainPage.getByRole('option', { name: 'INT16', exact: true }).click()
    await mainPage.keyboard.press('Enter')

    const rows = mainPage.locator('.MuiDataGrid-row')
    const rowsBefore = await rows.count()
    await enableReadConfiguration(mainPage)

    // The switch is drawn before the grid has swapped its rows for the mapping,
    // so the count is waited on rather than sampled.
    await expect.poll(() => rows.count()).toBeLessThan(rowsBefore)
    const configuredRows = await rows.count()
    expect(configuredRows).toBeGreaterThan(0)

    // No column offers a filter, the data type column least of all: its filter
    // is what hides the rows above, and editing it from the menu would bring
    // them back.
    for (const field of ['hex', 'dataType']) {
      await openColumnMenu(mainPage, field)
      await expect(
        mainPage.locator('.MuiDataGrid-menuList').getByRole('menuitem', { name: 'Filter' })
      ).toHaveCount(0)
      await mainPage.keyboard.press('Escape')
    }

    // And with no filter of the user's to clear, no button either.
    await expect(mainPage.getByTestId('clear-filters-btn')).not.toBeVisible()
    await expect(mainPage.locator('.MuiDataGrid-row')).toHaveCount(configuredRows)

    await disableReadConfiguration(mainPage)
  })

  // ─── Poll rate and timeout ──────────────────────────────────────────────────

  test('poll rate and timeout are picked in the top bar', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-rate-select').click()
    await mainPage.getByRole('option', { name: '2 s', exact: true }).click()
    await expect(mainPage.getByTestId('poll-rate-select')).toContainText('2 s')

    await mainPage.getByTestId('timeout-select').click()
    await mainPage.getByRole('option', { name: '3 s', exact: true }).click()
    await expect(mainPage.getByTestId('timeout-select')).toContainText('3 s')

    await mainPage.getByTestId('timeout-select').click()
    await mainPage.getByRole('option', { name: '5 s', exact: true }).click()
    await expect(mainPage.getByTestId('timeout-select')).toContainText('5 s')

    await mainPage.getByTestId('poll-rate-select').click()
    await mainPage.getByRole('option', { name: '1 s', exact: true }).click()
    await expect(mainPage.getByTestId('poll-rate-select')).toContainText('1 s')
  })
})
