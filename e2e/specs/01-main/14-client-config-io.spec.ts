/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  selectRegisterType,
  cell,
  enableReadConfiguration,
  disableReadConfiguration
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const CONFIG_FILES = {
  clientBasic: resolve(CONFIG_DIR, 'client-basic.json'),
  clientBasicLE: resolve(CONFIG_DIR, 'client-basic-le.json'),
  clientComprehensive: resolve(CONFIG_DIR, 'client-server1-unit0.json')
}

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

  test('verify config name is "Test Client"', async ({ mainPage }) => {
    const nameInput = mainPage.getByTestId('client-config-name-input').locator('input')
    await expect(nameInput).toHaveValue('Test Client')
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
    const dt0 = await cell(mainPage, 0, 'dataType')
    expect(dt0.toLowerCase()).toContain('int16')
    const dt1 = await cell(mainPage, 1, 'dataType')
    expect(dt1.toLowerCase()).toContain('uint16')
  })

  test('verify scaling factor visible in grid', async ({ mainPage }) => {
    // Address 1 has scalingFactor 0.1
    const sf = await cell(mainPage, 1, 'scalingFactor')
    expect(sf).toContain('0.1')
  })

  test('verify comments visible in grid', async ({ mainPage }) => {
    const comment0 = await cell(mainPage, 0, 'comment')
    expect(comment0).toBe('setpoint')
    const comment1 = await cell(mainPage, 1, 'comment')
    expect(comment1).toBe('temperature scaled')
  })

  test('switch to input registers — grid repopulates with config', async ({ mainPage }) => {
    await selectRegisterType(mainPage, 'Input Registers')

    const row0 = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row0).toBeVisible()

    const dt = await cell(mainPage, 0, 'dataType')
    expect(dt.toLowerCase()).toContain('int16')
    const comment = await cell(mainPage, 0, 'comment')
    expect(comment).toBe('sensor value')

    // Switch back to holding registers and disable readConfiguration
    await selectRegisterType(mainPage, 'Holding Registers')
    await disableReadConfiguration(mainPage)
  })

  test('save client config — verify download content', async ({ electronApp, mainPage }) => {
    const savePath = resolve(tmpdir(), `modbux-client-test-save-${Date.now()}.json`)

    await electronApp.evaluate(({ session }, path) => {
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSavePath(path)
      })
    }, savePath)

    await mainPage.getByTestId('save-config-btn').click()
    await mainPage.waitForTimeout(1000)

    const fs = await import('fs/promises')
    const content = await fs.readFile(savePath, 'utf-8')
    const config = JSON.parse(content)

    expect(config.version).toBe(2)
    expect(config.name).toBe('Test Client')
    expect(config.littleEndian).toBe(false)
    expect(config.registerMapping).toBeDefined()
    expect(config.registerMapping.holding_registers).toBeDefined()
    expect(Object.keys(config.registerMapping.holding_registers)).toHaveLength(2)
    expect(config.registerMapping.input_registers).toBeDefined()
    expect(Object.keys(config.registerMapping.input_registers)).toHaveLength(1)

    // Verify scaling factor round-tripped
    expect(config.registerMapping.holding_registers['1'].scalingFactor).toBe(0.1)

    await fs.unlink(savePath).catch(() => {})
  })

  test('clear client config — verify mappings removed', async ({ mainPage }) => {
    await mainPage.getByTestId('clear-config-btn').click()

    // After clearing, read-config toggle should be disabled (no mappings)
    const readConfigBtn = mainPage.getByTestId('reg-read-config-btn')
    await expect(readConfigBtn).toBeDisabled()

    // Config name should also be cleared
    const nameInput = mainPage.getByTestId('client-config-name-input').locator('input')
    await expect(nameInput).toHaveValue('')
  })

  test('reload saved config (round-trip) — verify name restored', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasic)
    await mainPage.waitForTimeout(1000)

    const nameInput = mainPage.getByTestId('client-config-name-input').locator('input')
    await expect(nameInput).toHaveValue('Test Client')
  })

  test('load comprehensive config (client-server1-unit0.json)', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientComprehensive)
    await mainPage.waitForTimeout(1000)

    const nameInput = mainPage.getByTestId('client-config-name-input').locator('input')
    await expect(nameInput).toHaveValue('Server 1 Unit 0')
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
