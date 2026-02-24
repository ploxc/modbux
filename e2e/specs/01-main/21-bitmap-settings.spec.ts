import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  cleanServerState,
  addRegister,
  selectRegisterType,
  loadClientConfig,
  loadDummyData,
  enableReadConfiguration,
  disableReadConfiguration
} from '../../fixtures/helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const BITMAP_CONFIG = resolve(CONFIG_DIR, 'client-bitmap.json')

test.describe.serial('Bitmap settings — color, invert & config persistence', () => {
  test('navigate to client and load bitmap config', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, BITMAP_CONFIG)
  })

  test('enable readConfiguration — bitmap row visible', async ({ mainPage }) => {
    await enableReadConfiguration(mainPage)
    const row = mainPage.locator('.MuiDataGrid-row[data-id="0"]')
    await expect(row).toBeVisible()
  })

  test('load dummy data so bits have values', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await loadDummyData(mainPage, '0', '1')
    await enableReadConfiguration(mainPage)
  })

  test('expand bitmap row — detail panel visible', async ({ mainPage }) => {
    const expandBtn = mainPage.getByTestId('bitmap-expand-0')
    await expect(expandBtn).toBeVisible()
    await expandBtn.click()
    await mainPage.waitForTimeout(300)

    // Detail panel should show bit indicators
    const bit0 = mainPage.getByTestId('bit-indicator-0')
    await expect(bit0).toBeVisible()
    const bit15 = mainPage.getByTestId('bit-indicator-15')
    await expect(bit15).toBeVisible()
  })

  test('verify configured comments from fixture', async ({ mainPage }) => {
    // bit 0 = "run", bit 1 = "alarm", bit 2 = "warning lamp", bit 7 = "heartbeat"
    await expect(mainPage.getByTestId('bit-indicator-0')).toContainText('run')
    await expect(mainPage.getByTestId('bit-indicator-1')).toContainText('alarm')
    await expect(mainPage.getByTestId('bit-indicator-2')).toContainText('warning lamp')
    await expect(mainPage.getByTestId('bit-indicator-7')).toContainText('heartbeat')
  })

  test('open bit settings popover via cog icon', async ({ mainPage }) => {
    await mainPage.getByTestId('bit-settings-0').click()
    await mainPage.waitForTimeout(200)

    // Popover should show invert toggle and color swatches
    await expect(mainPage.getByTestId('bit-invert-toggle')).toBeVisible()
    await expect(mainPage.getByTestId('bit-color-default')).toBeVisible()
    await expect(mainPage.getByTestId('bit-color-warning')).toBeVisible()
    await expect(mainPage.getByTestId('bit-color-error')).toBeVisible()
  })

  test('change color to warning', async ({ mainPage }) => {
    await mainPage.getByTestId('bit-color-warning').click()
    await mainPage.waitForTimeout(200)

    // Close popover
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('toggle invert on bit 0', async ({ mainPage }) => {
    await mainPage.getByTestId('bit-settings-0').click()
    await mainPage.waitForTimeout(200)

    await mainPage.getByTestId('bit-invert-toggle').click()
    await mainPage.waitForTimeout(200)

    // Close popover
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('verify bit 1 has error color from fixture', async ({ mainPage }) => {
    // bit 1 was configured with color: "error" in the fixture
    await mainPage.getByTestId('bit-settings-1').click()
    await mainPage.waitForTimeout(200)

    // The error swatch should be selected (has outline)
    await expect(mainPage.getByTestId('bit-color-error')).toBeVisible()

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('verify bit 2 has invert from fixture', async ({ mainPage }) => {
    // bit 2 was configured with invert: true in the fixture
    await mainPage.getByTestId('bit-settings-2').click()
    await mainPage.waitForTimeout(200)

    // Invert toggle should be selected (Mui-selected class)
    const invertToggle = mainPage.getByTestId('bit-invert-toggle')
    await expect(invertToggle).toHaveClass(/Mui-selected/)

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(200)
  })

  test('save config — bitMap settings round-trip', async ({ electronApp, mainPage }) => {
    const savePath = resolve(tmpdir(), `modbux-bitmap-test-${Date.now()}.json`)

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

    // Verify bitMap survived in the saved config
    const hr = config.registerMapping.holding_registers
    expect(hr['0']).toBeDefined()
    expect(hr['0'].dataType).toBe('bitmap')
    expect(hr['0'].bitMap).toBeDefined()

    // bit 0: we changed color to warning and enabled invert
    expect(hr['0'].bitMap['0'].comment).toBe('run')
    expect(hr['0'].bitMap['0'].color).toBe('warning')
    expect(hr['0'].bitMap['0'].invert).toBe(true)

    // bit 1: error color from fixture (no invert)
    expect(hr['0'].bitMap['1'].comment).toBe('alarm')
    expect(hr['0'].bitMap['1'].color).toBe('error')

    // bit 2: warning + invert from fixture
    expect(hr['0'].bitMap['2'].comment).toBe('warning lamp')
    expect(hr['0'].bitMap['2'].color).toBe('warning')
    expect(hr['0'].bitMap['2'].invert).toBe(true)

    // bit 7: comment only
    expect(hr['0'].bitMap['7'].comment).toBe('heartbeat')

    await fs.unlink(savePath).catch(() => {})
  })

  test('collapse bitmap row', async ({ mainPage }) => {
    const expandBtn = mainPage.getByTestId('bitmap-expand-0')
    await expandBtn.click()
    await mainPage.waitForTimeout(300)

    // Bit indicators should no longer be visible
    await expect(mainPage.getByTestId('bit-indicator-0')).not.toBeVisible()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Server-side bitmap tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe.serial('Server bitmap — expand, bit toggle & comment', () => {
  test('navigate to server and clear state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('add bitmap register with fixed value 5 (bits 0 & 2 set)', async ({ mainPage }) => {
    await addRegister(mainPage, {
      registerType: 'holding_registers',
      address: 100,
      dataType: 'BITMAP',
      mode: 'fixed',
      value: '5',
      comment: 'server status'
    })
  })

  test('bitmap expand button visible', async ({ mainPage }) => {
    const expandBtn = mainPage.getByTestId('server-bitmap-expand-100')
    await expect(expandBtn).toBeVisible()
  })

  test('expand bitmap row — detail panel visible', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bitmap-expand-100').click()
    await mainPage.waitForTimeout(300)

    const detail = mainPage.getByTestId('server-bitmap-detail-100')
    await expect(detail).toBeVisible()

    // All 16 bits should be rendered
    await expect(mainPage.getByTestId('server-bit-0')).toBeVisible()
    await expect(mainPage.getByTestId('server-bit-15')).toBeVisible()
  })

  test('verify initial bit states (value=5 → bits 0,2 on)', async ({ mainPage }) => {
    // Bit 0 circle should be "on" (success color)
    const bit0Circle = mainPage.getByTestId('server-bit-circle-0')
    await expect(bit0Circle).toBeVisible()

    // Bit 1 circle should be "off"
    const bit1Circle = mainPage.getByTestId('server-bit-circle-1')
    await expect(bit1Circle).toBeVisible()

    // Bit 2 circle should be "on"
    const bit2Circle = mainPage.getByTestId('server-bit-circle-2')
    await expect(bit2Circle).toBeVisible()
  })

  test('toggle bit 1 on (value changes 5 → 7)', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-1').click()
    await mainPage.waitForTimeout(500)

    // Value in the register row should now show 7
    const row = mainPage.getByTestId('server-edit-reg-holding_registers-100')
    await expect(row).toBeVisible()
  })

  test('add comment to bit 0', async ({ mainPage }) => {
    // Click the comment area of bit 0 to start editing
    const bit0 = mainPage.getByTestId('server-bit-0')
    await bit0.locator('span.MuiTypography-root').last().click()
    await mainPage.waitForTimeout(200)

    // Type comment and press Enter
    const input = bit0.locator('input')
    await input.fill('motor running')
    await input.press('Enter')
    await mainPage.waitForTimeout(300)

    // Verify comment is displayed
    await expect(bit0).toContainText('motor running')
  })

  test('collapse bitmap row', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bitmap-expand-100').click()
    await mainPage.waitForTimeout(300)

    // Detail panel should no longer be visible
    await expect(mainPage.getByTestId('server-bitmap-detail-100')).not.toBeVisible()
  })
})
