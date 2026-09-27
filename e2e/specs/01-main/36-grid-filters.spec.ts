import { test, expect, resetApp } from '../../fixtures/electron-app'
import {
  navigateToClient,
  connectClient,
  cleanServerState,
  loadServerConfig,
  loadClientConfig,
  selectRegisterType,
  readRegisters,
  enableAdvancedMode,
  openColumnMenu,
  expectCell,
  scrollCell
} from '../../fixtures/helpers'
import type { Page } from '@playwright/test'
import { resolve } from 'path'

const CONFIG_DIR = resolve(__dirname, '../../fixtures/config-files')

const rows = (p: Page): ReturnType<Page['locator']> => p.locator('.register-grid .MuiDataGrid-row')

/** Filter `field` with `operator` on `value`, through the column menu. */
async function filterOn(p: Page, field: string, operator: string, value: string): Promise<void> {
  await openColumnMenu(p, field)
  await p.locator('.MuiDataGrid-menuList').getByRole('menuitem', { name: 'Filter' }).click()
  await p.locator('.MuiDataGrid-filterFormOperatorInput').click()
  await p.getByRole('option', { name: operator, exact: true }).click()
  await p.locator('.MuiDataGrid-filterFormValueInput input').fill(value)
  await expect(p.getByTestId('clear-filters-btn')).toBeVisible()
  await p.keyboard.press('Escape')
}

async function clearFilters(p: Page): Promise<void> {
  await p.getByTestId('clear-filters-btn').click()
  await expect(p.getByTestId('clear-filters-btn')).not.toBeVisible()
}

test.beforeAll(async ({ electronApp, mainPage }) => {
  await resetApp(electronApp, mainPage)
})

// The grid's rows carry no values until a filter on a value asks for them, so
// every value filter is checked against what the rows hold.
test.describe.serial('Filters on the values a read holds', () => {
  test('clean server state and load the integration server', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, resolve(CONFIG_DIR, 'server-integration.json'))
  })

  test('connect, load the basic mapping and read 0 to 39', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await selectRegisterType(mainPage, 'Holding Registers')
    await loadClientConfig(mainPage, resolve(CONFIG_DIR, 'client-basic.json'))
    await connectClient(mainPage, '127.0.0.1', '502', '0')
    await readRegisters(mainPage, '0', '40')
    await expectCell(mainPage, 1, 'value', '50')
  })

  // Address 1 holds 500, mapped uint16 with a factor of 0.1.
  test('a filter on the converted value keeps the row that shows it', async ({ mainPage }) => {
    await filterOn(mainPage, 'value', 'equals', '50')

    await expect(rows(mainPage)).toHaveCount(1)
    await expect(rows(mainPage).first()).toHaveAttribute('data-id', '1')
    await clearFilters(mainPage)
  })

  test('a filter on a word keeps the rows that hold it', async ({ mainPage }) => {
    await filterOn(mainPage, 'word_uint16', '=', '500')

    await expect(rows(mainPage)).toHaveCount(1)
    await expect(rows(mainPage).first()).toHaveAttribute('data-id', '1')
    await clearFilters(mainPage)
  })

  // Address 25 is a generator of int16 between 0 and 1000, and every poll can
  // move it across 500. A filter that the rows stopped reaching would keep the
  // answer of the poll it was set on.
  test('while polling, a word filter follows the value it filters on', async ({ mainPage }) => {
    test.setTimeout(60_000)
    await mainPage.getByTestId('poll-btn').click()
    await filterOn(mainPage, 'word_int16', '>', '500')

    const seen = new Set<boolean>()
    for (let sample = 0; sample < 12 && seen.size < 2; sample++) {
      await mainPage.waitForTimeout(1000)
      await expect(async () => {
        const shown =
          (await mainPage.locator('.register-grid .MuiDataGrid-row[data-id="25"]').count()) > 0
        if (shown) {
          expect(Number(await scrollCell(mainPage, 25, 'word_int16'))).toBeGreaterThan(500)
        }
        seen.add(shown)
      }).toPass({ timeout: 2000 })
    }
    expect([...seen].sort()).toEqual([false, true])

    await mainPage.getByTestId('poll-btn').click()
    await clearFilters(mainPage)
  })
})
