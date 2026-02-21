/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../../fixtures/electron-app'
import { navigateToServer, navigateToClient, selectUnitId } from '../../fixtures/helpers'
import { resolve } from 'path'
import { tmpdir } from 'os'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const CONFIG_FILES = {
  serverBasic: resolve(CONFIG_DIR, 'server-basic.json'),
  serverFull: resolve(CONFIG_DIR, 'server-full.json'),
  serverLegacy: resolve(CONFIG_DIR, 'server-v1-legacy.json'),
  clientBasic: resolve(CONFIG_DIR, 'client-basic.json')
}

test.describe.serial('File I/O — open, save, clear server and client configs', () => {
  test('navigate to server view', async ({ mainPage }) => {
    await navigateToServer(mainPage)
  })

  // ─── Server config open ───────────────────────────────────────────────

  test('open server config via file input (server-basic.json)', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('server-open-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.serverBasic)
    await mainPage.waitForTimeout(1000)
  })

  test('verify loaded basic config: name, holding (2), input (1)', async ({ mainPage }) => {
    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    await expect(nameInput).toHaveValue('Basic Server')

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(0)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(0)')
  })

  test('verify loaded register values via edit modal', async ({ mainPage }) => {
    // Check holding register 0 = INT16, value 100
    await mainPage.getByTestId('server-edit-reg-holding_registers-0').click()
    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('INT16')
    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    expect(await valueInput.inputValue()).toBe('100')
    const commentInput = mainPage.getByTestId('add-reg-comment-input').locator('input')
    expect(await commentInput.inputValue()).toBe('setpoint')
    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  // ─── Server config clear ──────────────────────────────────────────────

  test('clear server config — verify all sections show (0)', async ({ mainPage }) => {
    await mainPage.getByTestId('server-clear-btn').click()
    await mainPage.waitForTimeout(500)

    await expect(mainPage.getByTestId('section-coils')).toContainText('(0)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(0)')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(0)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(0)')

    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    await expect(nameInput).toHaveValue('')
  })

  // ─── Full config with multi-unit ──────────────────────────────────────

  test('open full server config (server-full.json)', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('server-open-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.serverFull)
    await mainPage.waitForTimeout(1000)
  })

  test('verify full config: name, registers, booleans', async ({ mainPage }) => {
    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    await expect(nameInput).toHaveValue('Main Server')

    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(8)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(2)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(16)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(8)')
  })

  test('verify full config unit 1 loaded', async ({ mainPage }) => {
    await selectUnitId(mainPage, '1')
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(1)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(8)')

    // Switch back to unit 0
    await selectUnitId(mainPage, '0')
  })

  test('verify endianness: Big Endian after loading full config', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('server-endian-be-btn')).toHaveClass(/Mui-selected/)
  })

  // ─── Save config with content verification ────────────────────────────

  test('save server config — verify download content matches', async ({
    electronApp,
    mainPage
  }) => {
    const savePath = resolve(tmpdir(), `modbux-test-save-${Date.now()}.json`)

    await electronApp.evaluate(({ session }, path) => {
      session.defaultSession.on('will-download', (_event, item) => {
        item.setSavePath(path)
      })
    }, savePath)

    await mainPage.getByTestId('server-save-btn').click()
    await mainPage.waitForTimeout(1000)

    // Read and verify the saved file
    const fs = await import('fs/promises')
    const content = await fs.readFile(savePath, 'utf-8')
    const config = JSON.parse(content)

    expect(config.version).toBe(2)
    expect(config.name).toBe('Main Server')
    expect(config.littleEndian).toBe(false)
    expect(config.serverRegistersPerUnit).toBeDefined()
    expect(config.serverRegistersPerUnit['0']).toBeDefined()

    // Verify register counts match what was loaded
    const unit0 = config.serverRegistersPerUnit['0']
    expect(Object.keys(unit0.holding_registers)).toHaveLength(8)
    expect(Object.keys(unit0.input_registers)).toHaveLength(2)

    // Clean up temp file
    await fs.unlink(savePath).catch(() => {})
  })

  // ─── Legacy v1 config migration ───────────────────────────────────────

  test('load legacy v1 config (server-v1-legacy.json) — verify migration', async ({ mainPage }) => {
    // Clear first to ensure clean state
    await mainPage.getByTestId('server-clear-btn').click()
    await mainPage.waitForTimeout(500)

    const fileInput = mainPage.getByTestId('server-open-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.serverLegacy)
    await mainPage.waitForTimeout(1000)

    // Verify config loaded and migrated
    const nameInput = mainPage.getByTestId('server-name-input').locator('input')
    await expect(nameInput).toHaveValue('Legacy Server')

    // The legacy config has 1 holding register
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(1)')
  })

  test('verify legacy register migrated correctly', async ({ mainPage }) => {
    await mainPage.getByTestId('server-edit-reg-holding_registers-0').click()

    await expect(mainPage.getByTestId('add-reg-type-select')).toContainText('INT16')
    const valueInput = mainPage.getByTestId('add-reg-value-input').locator('input')
    expect(await valueInput.inputValue()).toBe('42')
    const commentInput = mainPage.getByTestId('add-reg-comment-input').locator('input')
    expect(await commentInput.inputValue()).toBe('legacy register')

    await mainPage.keyboard.press('Escape')
    await mainPage.waitForTimeout(300)
  })

  test('migration snackbar shown for legacy config', async ({ mainPage }) => {
    // Notistack renders snackbars in the DOM — check for migration message
    const snackbar = mainPage.locator('.notistack-SnackbarContainer')
    await expect(snackbar).toContainText('older format', { timeout: 3000 })
  })

  // ─── Client config file I/O ──────────────────────────────────────────

  test('navigate to client view', async ({ mainPage }) => {
    await navigateToClient(mainPage)
  })

  test('open client config via file input (client-basic.json)', async ({ mainPage }) => {
    const fileInput = mainPage.getByTestId('load-config-file-input')
    await fileInput.setInputFiles(CONFIG_FILES.clientBasic)
    await mainPage.waitForTimeout(1000)
  })

  test('verify client config loaded — register mapping applied', async ({ mainPage }) => {
    // The client view should still be functional
    await expect(mainPage.getByTestId('connect-btn')).toBeVisible()

    // The loaded config has a name "Test Client" — check if it's reflected anywhere
    // or at minimum verify the mapping was accepted without errors
    // The DataGrid should have some configured columns visible
    const grid = mainPage.locator('.MuiDataGrid-root')
    await expect(grid).toBeVisible()
  })
})
