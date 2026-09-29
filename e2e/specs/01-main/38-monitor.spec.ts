import { test, expect, resetApp } from '../../fixtures/electron-app'
import type { Locator, Page } from '@playwright/test'
import {
  navigateToClient,
  navigateToServer,
  connectClient,
  disconnectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')
const SERVER_CONFIG = resolve(CONFIG_DIR, 'server-monitor.json')
const CLIENT_CONFIG = resolve(CONFIG_DIR, 'client-monitor.json')

/** A cell of Monitor's grid, by the register type and address of its row. */
const monitorCell = (p: Page, type: string, address: number, field: string): Locator =>
  p.locator(
    `.monitor-grid .MuiDataGrid-row[data-id$="|${type}|${address}"] [data-field="${field}"]`
  )

/** A control in a group's head, of unit id 0, by the group's type and start. */
const head = (p: Page, type: string, start: number, control: string): Locator =>
  p.getByTestId(`monitor-group-0-${type}-${start}-${control}`)

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

test.describe.serial('Monitor — read configuration in one grid', () => {
  test('a server with registers and coils, and a client mapping both', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, SERVER_CONFIG)
    await navigateToClient(mainPage)
    await loadClientConfig(mainPage, CLIENT_CONFIG)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('the switch shows a head per group, coils included', async ({ mainPage }) => {
    await mainPage.getByTestId('client-view-monitor-btn').click()

    await expect(mainPage.getByTestId('monitor')).toBeVisible()
    await expect(mainPage.getByTestId('client-view-monitor-btn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(mainPage.getByTestId('monitor-group-0-holding_registers-0')).toBeVisible()
    await expect(mainPage.getByTestId('monitor-group-0-input_registers-0')).toBeVisible()
    await expect(mainPage.getByTestId('monitor-group-0-coils-0')).toBeVisible()
  })

  test('READ reads its group, with the round trip in the head', async ({ mainPage }) => {
    await head(mainPage, 'holding_registers', 0, 'read').click()

    await expect(monitorCell(mainPage, 'holding_registers', 0, 'value')).toHaveText('100')
    await expect(monitorCell(mainPage, 'holding_registers', 1, 'value')).toHaveText('50')
    await expect(head(mainPage, 'holding_registers', 0, 'round-trip')).toContainText('ms')
    // The other groups were not read.
    await expect(monitorCell(mainPage, 'input_registers', 0, 'value')).toHaveText('')
  })

  test('a poll reads every group whose Poll is on', async ({ mainPage }) => {
    await head(mainPage, 'input_registers', 0, 'poll').click()
    await head(mainPage, 'coils', 0, 'poll').click()
    await mainPage.getByTestId('poll-btn').click()

    await expect(monitorCell(mainPage, 'input_registers', 0, 'value')).toHaveText('200')
    await expect(monitorCell(mainPage, 'coils', 0, 'value')).toHaveText('1')
    await expect(monitorCell(mainPage, 'coils', 1, 'value')).toHaveText('0')
  })

  test('writing and READ are off while it polls', async ({ mainPage }) => {
    await expect(mainPage.getByTestId('monitor-write-0-holding_registers-0')).toBeDisabled()
    await expect(head(mainPage, 'holding_registers', 0, 'read')).toBeDisabled()

    await mainPage.getByTestId('poll-btn').click()
    await expect(mainPage.getByTestId('monitor-write-0-holding_registers-0')).toBeEnabled()
  })

  test('a write reaches the register, and Monitor reads it back', async ({ mainPage }) => {
    await mainPage.getByTestId('monitor-write-0-holding_registers-0').click()
    await mainPage.getByTestId('write-value-input').locator('input').fill('123')
    await mainPage.getByTestId('write-fc6-btn').click()
    await mainPage.keyboard.press('Escape')

    await expect(monitorCell(mainPage, 'holding_registers', 0, 'value')).toHaveText('123')
  })

  test('Collapse all folds every group to its head, and Expand all opens them', async ({
    mainPage
  }) => {
    await mainPage.getByTestId('monitor-collapse-all-btn').click()
    await expect(monitorCell(mainPage, 'holding_registers', 0, 'value')).toHaveCount(0)
    await expect(mainPage.getByTestId('monitor-group-0-coils-0')).toBeVisible()

    await mainPage.getByTestId('monitor-expand-all-btn').click()
    await expect(monitorCell(mainPage, 'holding_registers', 0, 'value')).toHaveCount(1)
  })

  test('the rail carries the switch too', async ({ mainPage }) => {
    await mainPage.getByTestId('client-sidebar-collapse-btn').click()
    await mainPage.getByTestId('client-rail-view-debug-btn').click()
    await expect(mainPage.getByTestId('monitor')).toHaveCount(0)

    await mainPage.getByTestId('client-rail-view-monitor-btn').click()
    await expect(mainPage.getByTestId('monitor')).toBeVisible()
    await mainPage.getByTestId('client-rail-expand-btn').click()
  })

  test('Show unit takes Debug to the unit, with the group as its window', async ({ mainPage }) => {
    await head(mainPage, 'holding_registers', 0, 'show-unit').click()

    await expect(mainPage.getByTestId('monitor')).toHaveCount(0)
    await expect(mainPage.getByTestId('client-view-debug-btn')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(mainPage.getByTestId('reg-address-input').locator('input')).toHaveValue('0')
    await expect(mainPage.getByTestId('reg-length-input').locator('input')).toHaveValue('2')
  })

  test('cleanup', async ({ mainPage }) => {
    await disconnectClient(mainPage)
  })
})
