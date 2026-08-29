/**
 * How much a mounted register grid costs during a scan.
 *
 * The grid is unmounted while a register scan runs, and has been since a scan
 * with the grid up was slow enough to be a problem. This measures whether it
 * still is: same server, same scan, same machine, with the grid mounted and
 * without.
 *
 * Not part of the suite. Run it with `yarn test:e2e --grep "Scan grid cost"`.
 */

import { test, expect } from '../../fixtures/electron-app'
import {
  loadServerConfig,
  navigateToClient,
  connectClient,
  enableAdvancedMode,
  cleanServerState
} from '../../fixtures/helpers'
import { resolve } from 'path'

const CONFIG = resolve(__dirname, '../../fixtures/config-files/server-scan-perf.json')

// The scan the question is about: many messages, and enough rows to fill a grid.
// Every address in this range exists on the server, so nothing errors and the
// measurement is about the grid rather than about failed reads.
const SCAN_LENGTH = process.env.SCAN_LENGTH ?? '2000'
const CHUNK_SIZE = process.env.CHUNK_SIZE ?? '1'

test.describe.serial('Scan grid cost', () => {
  test('load a server with 2000 registers', async ({ mainPage }) => {
    await cleanServerState(mainPage)
    await loadServerConfig(mainPage, CONFIG)
  })

  test('connect', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await enableAdvancedMode(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('scan and time it', async ({ mainPage }) => {
    // The whole point is a long scan, so the 60s the suite allows is not enough.
    test.setTimeout(600000)

    await mainPage.getByTestId('menu-btn').click()
    await mainPage.getByTestId('scan-registers-btn').click()

    await mainPage.getByTestId('scan-address-input').locator('input').fill('0')
    await mainPage.getByTestId('scan-length-input').locator('input').fill(SCAN_LENGTH)
    await mainPage.getByTestId('scan-chunk-size-input').locator('input').fill(CHUNK_SIZE)
    await mainPage.getByTestId('scan-timeout-input').locator('input').fill('500')

    // A scan that "freezes" is one long task, not a slow total, so watch the
    // gap between two turns of the event loop for the whole run.
    await mainPage.evaluate(() => {
      const w = window as unknown as { __worst: number; __stop: () => void }
      w.__worst = 0
      let last = performance.now()
      let handle = 0
      const tick = (): void => {
        const now = performance.now()
        w.__worst = Math.max(w.__worst, now - last)
        last = now
        handle = window.setTimeout(tick, 0)
      }
      tick()
      w.__stop = (): void => window.clearTimeout(handle)
    })

    const start = Date.now()
    await mainPage.getByTestId('scan-start-stop-btn').click()

    // Whether the grid is on screen while the scan runs is the thing under test.
    const gridMounted = await mainPage.locator('.MuiDataGrid-root').isVisible()

    // The dialog closes itself when the scan finishes, so the button going away
    // is the end of the run. Waiting for its text to change waits forever.
    await expect(mainPage.getByTestId('scan-start-stop-btn')).toHaveCount(0, { timeout: 540000 })
    const elapsed = Date.now() - start

    const worst = await mainPage.evaluate((): number => {
      const w = window as unknown as { __worst: number; __stop: () => void }
      w.__stop()
      return Math.round(w.__worst)
    })

    const footer = await mainPage.locator('.MuiTablePagination-displayedRows').first().textContent()
    console.log(
      `\nGRID MOUNTED DURING SCAN: ${gridMounted}` +
        `\n  scan: ${elapsed}ms for ${SCAN_LENGTH} addresses in chunks of ${CHUNK_SIZE}` +
        `\n  longest blocked stretch: ${worst}ms` +
        `\n  rows found: ${footer?.trim()}\n`
    )
  })
})
