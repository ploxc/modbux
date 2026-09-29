/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  selectRegisterType,
  enableReadConfiguration,
  disableReadConfiguration,
  expectCellContains,
  expectCell,
  clearClientConfig
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'
import { evaluateMain } from '../../fixtures/launch'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const CONFIG_FILES = {
  clientBasic: resolve(CONFIG_DIR, 'client-basic.json'),
  clientBasicLE: resolve(CONFIG_DIR, 'client-basic-le.json'),
  clientComprehensive: resolve(CONFIG_DIR, 'client-server1-unit0.json')
}

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Client config I/O — view, save, clear, load', () => {
  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('load client-basic.json', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasic)
    await mainPage.waitForTimeout(1000)

    const grid = mainPage.locator('.MuiDataGrid-root')
    await expect(grid).toBeVisible()
  })

  test('verify unit name is "Test Client"', async ({ mainPage }) => {
    const unitTab = mainPage.getByTestId('unit-tab-0')
    await expect(unitTab).toContainText('Test Client')
  })

  test('enable readConfiguration — populates grid with configured registers', async ({
    mainPage
  }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await enableReadConfiguration(mainPage)

    // Grid should show rows for configured addresses (0 and 1 from client-basic.json)
    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row0).toBeVisible()
    const row1 = mainPage.locator('.MuiDataGrid-row[data-id="1"]')
    await expect(row1).toBeVisible()

    // Check data types in the grid
    await expectCellContains(mainPage, 0, 'dataType', 'int16', { ignoreCase: true })
    await expectCellContains(mainPage, 1, 'dataType', 'uint16', { ignoreCase: true })
  })

  test('verify scaling factor visible in grid', async ({ mainPage }) => {
    // Address 1 has scalingFactor 0.1, which reads as Scale
    await expectCellContains(mainPage, 1, 'conversion', '0.1')
  })

  // Typed rather than picked, so the list is a suggestion and not a limit.
  test('a unit typed into the Unit cell stays on the register', async ({ mainPage }) => {
    const row1 = mainPage.locator('.MuiDataGrid-row[data-id="1"]')
    await row1.locator('[data-field="unit"]').dblclick()
    const input = mainPage.getByTestId('unit-input-1')
    await expect(input).toBeVisible()
    await input.fill('°C')
    await mainPage.keyboard.press('Enter')
    await expectCell(mainPage, 1, 'unit', '°C')
  })

  // Address 0 is an INT16. A script that does not parse keeps Save greyed and
  // says where; one that parses shows its result for a raw value typed in.
  test('a Custom script is previewed while it is written, and saved', async ({ mainPage }) => {
    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await row0.getByTestId('conversion-cell-0').click()
    await mainPage.getByTestId('conversion-kind-script-btn').click()

    // CodeMirror's editable surface, which takes a fill like an input.
    const script = mainPage.getByTestId('conversion-script-input').locator('.cm-content')
    await script.fill('return Math.abs(raw / 100')
    await mainPage.getByTestId('conversion-test-input').fill('-250')
    await expect(mainPage.getByTestId('conversion-script-status')).toContainText('Line 1')
    await expect(mainPage.getByTestId('conversion-test-result')).toHaveText('—')
    await expect(mainPage.getByTestId('conversion-save-btn')).toBeDisabled()

    // It compiles, and still leaves a path that returns nothing.
    await script.fill('if (raw < 0) return Math.abs(raw) / 100')
    await expect(mainPage.getByTestId('conversion-script-status')).toContainText(
      'Not every path returns a value'
    )
    await expect(mainPage.getByTestId('conversion-save-btn')).toBeDisabled()

    await script.fill('return Math.abs(raw) / 100')
    await expect(mainPage.getByTestId('conversion-script-status')).toHaveCount(0)
    await expect(mainPage.getByTestId('conversion-test-result')).toHaveText('2.5')
    await mainPage.getByTestId('conversion-save-btn').click()
    await expect(row0.locator('[data-field="conversion"] svg')).toBeVisible()
  })

  // Insert puts a template at the cursor, and its helpers run: bit() reads
  // bit 0 of 5 as 1. Cancel leaves the saved script alone.
  test('Insert puts a template in the script, and its helpers run', async ({ mainPage }) => {
    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await row0.getByTestId('conversion-cell-0').click()
    const script = mainPage.getByTestId('conversion-script-input').locator('.cm-content')
    await script.fill('')
    await mainPage.getByTestId('conversion-insert-btn').click()
    await mainPage.getByTestId('conversion-template-1').click()
    await expect(script).toContainText('bit(raw, 0)')
    await mainPage.getByTestId('conversion-test-input').fill('5')
    await expect(mainPage.getByTestId('conversion-test-result')).toHaveText('1')
    await mainPage.getByTestId('conversion-cancel-btn').click()
  })

  // The raw value to try is one the INT16 at address 0 can hold: letters and a
  // separator are dropped, and a number past the type stops at its end.
  test('the raw value to try takes what the data type reads', async ({ mainPage }) => {
    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await row0.getByTestId('conversion-cell-0').click()
    const test = mainPage.getByTestId('conversion-test-input')
    await test.pressSequentially('a1.5')
    await expect(test).toHaveValue('15')
    await test.fill('')
    await test.pressSequentially('-40000')
    await expect(test).toHaveValue('-32768')
    await mainPage.getByTestId('conversion-cancel-btn').click()
  })

  test('verify comments visible in grid', async ({ mainPage }) => {
    await expectCell(mainPage, 0, 'comment', 'setpoint')
    await expectCell(mainPage, 1, 'comment', 'temperature scaled')
  })

  test('switch to input registers — grid repopulates with config', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Input Registers')

    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row0).toBeVisible()

    await expectCellContains(mainPage, 0, 'dataType', 'int16', { ignoreCase: true })
    await expectCell(mainPage, 0, 'comment', 'sensor value')

    // Switch back to holding registers and disable readConfiguration
    await selectRegisterType(mainPage, 'Holding Registers')
    await disableReadConfiguration(mainPage)
  })

  test('save client config — verify download content', async ({ electronApp, mainPage }) => {
    const savePath = resolve(tmpdir(), `modbux-client-test-save-${Date.now()}.json`)

    await evaluateMain(() =>
      electronApp.evaluate(({ session }, path) => {
        session.defaultSession.on('will-download', (_event, item) => {
          item.setSavePath(path)
        })
      }, savePath)
    )

    await mainPage.getByTestId('save-config-btn').click()
    await mainPage.waitForTimeout(1000)

    const fs = await import('fs/promises')
    const content = await fs.readFile(savePath, 'utf-8')
    const config = JSON.parse(content)

    expect(config.kind).toBe('client-device')
    expect(config.version).toBe(3)
    expect(typeof config.unitId).toBe('number')
    expect(config.name).toBe('Test Client')
    expect(config.littleEndian).toBe(false)
    expect(config.registerMapping).toBeDefined()
    expect(config.registerMapping.holding_registers).toBeDefined()
    expect(Object.keys(config.registerMapping.holding_registers)).toHaveLength(2)
    expect(config.registerMapping.input_registers).toBeDefined()
    expect(Object.keys(config.registerMapping.input_registers)).toHaveLength(1)

    // Verify scaling factor round-tripped
    expect(config.registerMapping.holding_registers['0'].conversion).toEqual({
      kind: 'script',
      code: 'return Math.abs(raw) / 100'
    })
    expect(config.registerMapping.holding_registers['1'].conversion).toEqual({
      kind: 'scale',
      factor: 0.1
    })
    expect(config.registerMapping.holding_registers['1'].unit).toBe('°C')

    await fs.unlink(savePath).catch(() => {})
  })

  test('clear client config — verify mappings removed', async ({ mainPage }) => {
    await clearClientConfig(mainPage)

    // After clearing, read-config toggle should be disabled (no mappings)
    const readConfigBtn = mainPage.getByTestId('reg-read-config-btn')
    await expect(readConfigBtn).toBeDisabled()

    // The unit name goes with it
    const unitTab = mainPage.getByTestId('unit-tab-0')
    await expect(unitTab).not.toContainText('Test Client')
  })

  test('reload saved config (round-trip) — verify name restored', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasic)
    await mainPage.waitForTimeout(1000)

    const unitTab = mainPage.getByTestId('unit-tab-0')
    await expect(unitTab).toContainText('Test Client')
  })

  test('load comprehensive config (client-server1-unit0.json)', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientComprehensive)
    await mainPage.waitForTimeout(1000)

    const unitTab = mainPage.getByTestId('unit-tab-0')
    await expect(unitTab).toContainText('Server 1 Unit 0')
  })

  test('verify comprehensive config — readConfiguration shows all data types in grid', async ({
    mainPage
  }) => {
    await selectRegisterType(mainPage, 'Holding Registers')
    await enableReadConfiguration(mainPage)

    // client-server1-unit0.json has: int16@0, uint16@1, int32@2, uint32@4, float@6,
    // int64@8, uint64@12, double@16, utf8@20, unix@25, datetime@27
    const grid = mainPage.locator('.MuiDataGrid-root')
    await expect(grid).toContainText('INT16', { timeout: 3000 })
    await expect(grid).toContainText('UINT16')
    await expect(grid).toContainText('INT32')
    await expect(grid).toContainText('UINT32')
    await expect(grid).toContainText('FLOAT')
    await expect(grid).toContainText('INT64')
    await expect(grid).toContainText('UINT64')
    await expect(grid).toContainText('DOUBLE')
    await expect(grid).toContainText('UTF8')
    await expect(grid).toContainText('UNIX')
    await expect(grid).toContainText('DATETIME')

    // Disable readConfiguration
    await disableReadConfiguration(mainPage)
  })

  // ─── Endianness restore on config load ──────────────────────────────

  test('verify endian toggle is Big Endian after loading BE config', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('endian-be-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('endian-le-btn')).not.toHaveClass(/Mui-selected/)
  })

  test('load LE config — endian toggle switches to Little Endian', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasicLE)
    await mainPage.waitForTimeout(1000)

    await expect(mainPage.getByTestId('endian-le-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('endian-be-btn')).not.toHaveClass(/Mui-selected/)
  })

  test('load BE config — endian toggle switches back to Big Endian', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasic)
    await mainPage.waitForTimeout(1000)

    await expect(mainPage.getByTestId('endian-be-btn')).toHaveClass(/Mui-selected/)
    await expect(mainPage.getByTestId('endian-le-btn')).not.toHaveClass(/Mui-selected/)
  })
})
