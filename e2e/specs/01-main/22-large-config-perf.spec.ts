/**
 * Performance test: loading a large server config (20 unit IDs, 2600 entries).
 * Measures how long the sequential for...of loop takes to load all unit configs.
 */

import { test, expect } from '../../fixtures/electron-app'
import { navigateToServer, loadServerConfig, selectUnitId } from '../../fixtures/helpers'
import { resolve } from 'path'

const LARGE_CONFIG = resolve(__dirname, '../../fixtures/config-files/server-large-perf.json')

test.describe.serial('Large config performance (20 units, 2600 entries)', () => {
  test('navigate to server', async ({ mainPage }) => {
    await navigateToServer(mainPage)
  })

  test('load large config and measure time', async ({ mainPage }) => {
    const start = Date.now()

    await loadServerConfig(mainPage, LARGE_CONFIG)

    // Wait until the config has fully loaded — check that unit 0 holding registers show (50)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(50)', {
      timeout: 60000
    })

    const elapsed = Date.now() - start
    console.log(`\n⏱  Large config load time: ${elapsed}ms\n`)

    // Verify last unit ID (19) also loaded
    await selectUnitId(mainPage, '19')
    await mainPage.waitForTimeout(500)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(50)', {
      timeout: 10000
    })
    await expect(mainPage.getByTestId('section-coils')).toContainText('(30)')
    await expect(mainPage.getByTestId('section-discrete_inputs')).toContainText('(30)')
    await expect(mainPage.getByTestId('section-input_registers')).toContainText('(20)')

    const totalElapsed = Date.now() - start
    console.log(`⏱  Total time (load + verify last unit): ${totalElapsed}ms\n`)
  })

  test('spot-check middle unit (10)', async ({ mainPage }) => {
    await selectUnitId(mainPage, '10')
    await mainPage.waitForTimeout(500)
    await expect(mainPage.getByTestId('section-holding_registers')).toContainText('(50)')
    await expect(mainPage.getByTestId('section-coils')).toContainText('(30)')
  })

  test('cleanup', async ({ mainPage }) => {
    await mainPage.getByTestId('server-clear-btn').click()
    // Confirm clear dialog
    const confirmBtn = mainPage.getByRole('button', { name: /confirm|yes|clear/i })
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click()
    }
    await mainPage.waitForTimeout(500)
  })
})
