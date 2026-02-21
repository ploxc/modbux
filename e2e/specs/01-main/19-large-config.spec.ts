import { test, expect } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  disconnectClient,
  enableAdvancedMode,
  enableReadConfiguration,
  disableReadConfiguration,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  selectRegisterType,
  scrollCell,
  cell
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-large-config.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-large-config.json')

test.describe.serial('Large Config (>100 registers) with readConfiguration', () => {
  // ─── Setup ──────────────────────────────────────────────────────

  test('clean server state', async ({ mainPage }) => {
    await cleanServerState(mainPage)
  })

  test('load server config with 120 holding registers', async ({ mainPage }) => {
    await loadServerConfig(mainPage, SERVER_CONFIG)
  })

  test('navigate to client and load config', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, CLIENT_CONFIG)
  })

  test('connect and enable readConfiguration', async ({ mainPage }) => {
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await enableReadConfiguration(mainPage)
  })

  // ─── Read all configured registers ──────────────────────────────

  test('readConfiguration reads all 120 registers', async ({ mainPage }) => {
    await mainPage.getByTestId('read-btn').click()
    await mainPage.waitForTimeout(3000)

    // Pagination should show 120 total rows
    const paginationText = await mainPage
      .locator('.MuiTablePagination-displayedRows')
      .textContent()
    expect(paginationText).toContain('120')
  })

  // ─── Page 1: addresses 0–99, group 1 ───────────────────────────

  test('verify page 1 data (addresses 0–99)', async ({ mainPage }) => {
    expect(await cell(mainPage, 0, 'word_uint16')).toBe('1')
    expect(await scrollCell(mainPage, 50, 'word_uint16')).toBe('51')
    expect(await scrollCell(mainPage, 99, 'word_uint16')).toBe('100')
  })

  test('page 1 groupIndex is 1 (addresses 0–99)', async ({ mainPage }) => {
    expect(await scrollCell(mainPage, 0, 'groupIndex')).toBe('1')
    expect(await scrollCell(mainPage, 99, 'groupIndex')).toBe('1')
  })

  // ─── Page 2: addresses 100–119, group 2 ────────────────────────

  test('navigate to page 2', async ({ mainPage }) => {
    await mainPage.getByRole('button', { name: 'Go to next page' }).click()
    await mainPage.waitForTimeout(500)

    // First row on page 2 should be address 100
    await expect(mainPage.locator('.MuiDataGrid-row[data-id="100"]')).toBeVisible()
  })

  test('verify page 2 data (addresses 100–119)', async ({ mainPage }) => {
    expect(await cell(mainPage, 100, 'word_uint16')).toBe('101')
    expect(await scrollCell(mainPage, 119, 'word_uint16')).toBe('120')
  })

  test('page 2 groupIndex is 2 (addresses 100–119)', async ({ mainPage }) => {
    expect(await cell(mainPage, 100, 'groupIndex')).toBe('2')
    expect(await scrollCell(mainPage, 119, 'groupIndex')).toBe('2')
  })

  test('page 2 comments survived readConfiguration', async ({ mainPage }) => {
    expect(await cell(mainPage, 100, 'comment')).toBe('reg-100')
    expect(await scrollCell(mainPage, 119, 'comment')).toBe('reg-119')
  })

  // ─── Polling with page switching ──────────────────────────────

  test('start polling', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
    await mainPage.waitForTimeout(2000)
  })

  test('page 2 data intact during polling', async ({ mainPage }) => {
    expect(await cell(mainPage, 100, 'word_uint16')).toBe('101')
    expect(await scrollCell(mainPage, 119, 'word_uint16')).toBe('120')
  })

  test('switch to page 1 during polling', async ({ mainPage }) => {
    await mainPage.getByRole('button', { name: 'Go to previous page' }).click()
    await mainPage.waitForTimeout(1000)

    expect(await cell(mainPage, 0, 'word_uint16')).toBe('1')
    expect(await scrollCell(mainPage, 99, 'word_uint16')).toBe('100')
  })

  test('switch back to page 2 during polling', async ({ mainPage }) => {
    await mainPage.getByRole('button', { name: 'Go to next page' }).click()
    await mainPage.waitForTimeout(1000)

    expect(await cell(mainPage, 100, 'word_uint16')).toBe('101')
    expect(await scrollCell(mainPage, 119, 'word_uint16')).toBe('120')
  })

  test('stop polling', async ({ mainPage }) => {
    await mainPage.getByTestId('poll-btn').click()
  })

  // ─── Cleanup ────────────────────────────────────────────────────

  test('cleanup', async ({ mainPage }) => {
    await disableReadConfiguration(mainPage)
    await disconnectClient(mainPage)
  })
})
