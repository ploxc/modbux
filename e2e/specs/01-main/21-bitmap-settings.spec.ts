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

  // With readConfiguration on, the register list comes from the loaded config,
  // so the manual address/length inputs are disabled. Asserted explicitly
  // because it also bites across specs: the app fixture is worker-scoped, so a
  // spec that leaves readConfiguration enabled silently breaks any later spec
  // that fills these fields (see the cleanup test at the end).
  test('readConfiguration disables the manual address and length inputs', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('reg-address-input').locator('input')).toBeDisabled()
    await expect(mainPage.getByTestId('reg-length-input').locator('input')).toBeDisabled()
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

  // The grid places every row below this one from what `getRowHeight` answers,
  // so a panel whose height reaches nothing leaves the rows under it sitting
  // where the ones above them already are, and the last of them out of scroll
  // reach by exactly the panel's height. Measured before the fix, with
  // virtualisation forced on and 100 rows loaded: the last row's bottom sat at
  // 1044 against a scroller ending at 911.
  test('an expanded bitmap row is as tall as the panel inside it', async ({ mainPage }) => {
    // The scroller only has a scroll model to be wrong about once the rows
    // outgrow it, so this one reads more than the configured register. The
    // mapping keeps the bitmap type with read configuration off.
    const expandButton = mainPage.getByTestId('bitmap-expand-0')
    if (await mainPage.getByTestId('bit-indicator-0').isVisible()) {
      await expandButton.click()
      await mainPage.waitForTimeout(300)
    }
    await disableReadConfiguration(mainPage)
    await loadDummyData(mainPage, '0', '60')

    const outer = mainPage.locator('div[data-id="0"]').first()
    // Scoped to the register grid: the transaction log is a second DataGrid,
    // and an unscoped locator is a strict-mode failure whenever it is open.
    const scroller = mainPage.locator('.register-grid .MuiDataGrid-virtualScroller')
    const collapsedHeight = (await outer.boundingBox())?.height ?? 0
    const collapsedScroll = await scroller.evaluate((el: HTMLElement) => el.scrollHeight)

    await expandButton.click()
    await mainPage.waitForTimeout(500)

    const expandedHeight = (await outer.boundingBox())?.height ?? 0
    const expandedScroll = await scroller.evaluate((el: HTMLElement) => el.scrollHeight)
    const grew = expandedHeight - collapsedHeight

    expect(grew).toBeGreaterThan(0)
    // The scroller's own model, not the rendered row. A fixed rowHeight the
    // panel's height reaches in no way leaves this at zero, and the last row
    // ends below the furthest the grid will scroll.
    expect(expandedScroll - collapsedScroll).toBeGreaterThanOrEqual(grew)

    // An address stops being a bitmap while its panel is open: the type cell is
    // editable and nothing collapses the row on the way out. The panel goes,
    // and the height reserved for it has to go too or a gap is left with no
    // control to close it.
    const typeCell = mainPage.locator('.MuiDataGrid-row[data-id="0"] [data-field="dataType"]')
    await typeCell.dblclick()
    await mainPage.getByRole('option', { name: 'UINT16', exact: true }).click()
    await mainPage.keyboard.press('Enter')
    await mainPage.waitForTimeout(500)

    // The scroller's model, not the rendered row: the row draws its own height
    // from its content either way, and what the grid reserved for it is where
    // the gap would be.
    expect(await scroller.evaluate((el: HTMLElement) => el.scrollHeight)).toBe(collapsedScroll)

    await typeCell.dblclick()
    await mainPage.getByRole('option', { name: 'BITMAP', exact: true }).click()
    await mainPage.keyboard.press('Enter')
    await mainPage.waitForTimeout(500)

    // Back to the one configured register, expanded, which is what the test
    // below collapses.
    await expandButton.click()
    await mainPage.waitForTimeout(300)
    await loadDummyData(mainPage, '0', '1')
    await enableReadConfiguration(mainPage)
    await expandButton.click()
    await mainPage.waitForTimeout(300)
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

const BIT_INDICES = Array.from({ length: 16 }, (_, i) => i)

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

  // A circle is visible whatever its bit is. `data-active` carries the state
  // its colour comes from.
  test('verify initial bit states (value=5 → bits 0,2 on)', async ({ mainPage }) => {
    for (const bitIndex of BIT_INDICES) {
      const expected = (5 >> bitIndex) & 1 ? 'true' : 'false'
      await expect(mainPage.getByTestId(`server-bit-circle-${bitIndex}`)).toHaveAttribute(
        'data-active',
        expected
      )
    }
  })

  test('toggle bit 1 on (value changes 5 → 7)', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bit-circle-1').click()

    await expect(mainPage.getByTestId('server-bit-circle-1')).toHaveAttribute('data-active', 'true')
    await expect(mainPage.getByTestId('server-reg-value-holding_registers-100')).toHaveText('7')
  })

  test('add comment to bit 0', async ({ mainPage }) => {
    // The comment carries one testid in both of its states, editing and not.
    await mainPage.getByTestId('server-bit-comment-0').click()
    await mainPage.waitForTimeout(200)

    const input = mainPage.getByTestId('server-bit-0').locator('input')
    await input.fill('motor running')
    await input.press('Enter')

    await expect(mainPage.getByTestId('server-bit-comment-0')).toHaveText('motor running')
  })

  test('collapse bitmap row', async ({ mainPage }) => {
    await mainPage.getByTestId('server-bitmap-expand-100').click()
    await mainPage.waitForTimeout(300)

    // Detail panel should no longer be visible
    await expect(mainPage.getByTestId('server-bitmap-detail-100')).not.toBeVisible()
  })

  // ─── Cleanup ────────────────────────────────────────────────────

  // Turning readConfiguration back off restores the manual inputs — and keeps
  // the state clean for the rest of the run. Without this, later specs that
  // fill the address field (e.g. 23-server-rtu) fail on a disabled input.
  test('cleanup: disabling readConfiguration re-enables the inputs', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await disableReadConfiguration(mainPage)

    await expect(mainPage.getByTestId('reg-address-input').locator('input')).toBeEnabled()
    await expect(mainPage.getByTestId('reg-length-input').locator('input')).toBeEnabled()
  })
})
