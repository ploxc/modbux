/**
 * Disconnect messaging
 *
 * A deliberate disconnect must not be reported as a failure. The suite never
 * looked at these snackbars before, which is how "Connection closed
 * unexpectedly" managed to appear on every disconnect without a test noticing.
 *
 * Both transports are covered. A serial port has always lost that race. A TCP
 * socket only started losing it on the Electron this release moves to, where
 * the close event comes back a tick earlier, so the TCP case here reads as a
 * guard rather than as the bug it was written for.
 */
import { test, expect } from '../../fixtures/electron-app'
import type { Page } from '@playwright/test'
import {
  cleanServerState,
  connectClient,
  connectClientRTU,
  disconnectClient,
  navigateToClient,
  navigateToServer
} from '../../fixtures/helpers'
import { spawn, type ChildProcess } from 'child_process'
import { existsSync, unlinkSync } from 'fs'

const SOCAT_PATHS = ['/usr/local/bin/socat', '/usr/bin/socat']
// The bare name when neither path is there, so `hasSocat` is what decides
// whether the suite runs rather than a path that happens to exist.
const SOCAT_PATH = SOCAT_PATHS.find((p) => existsSync(p)) ?? 'socat'
const hasSocat = existsSync(SOCAT_PATH)
const PTY_0 = '/tmp/ttyVDISC0'
const PTY_1 = '/tmp/ttyVDISC1'

const SNACKBARS = '.notistack-SnackbarContainer'

/**
 * Snackbars auto-hide after 3s and both messages are raised in the same tick,
 * so read them as soon as the expected one lands rather than after a wait.
 */
async function expectCleanDisconnect(p: Page): Promise<void> {
  const snackbars = p.locator(SNACKBARS)
  await expect(snackbars).toContainText('Disconnected from server', { timeout: 5000 })
  await expect(snackbars).not.toContainText('unexpectedly')
}

test.describe.serial('Disconnect messaging — TCP', () => {
  test('clean server state', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
  })

  test('connect over TCP', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClient(mainPage, '127.0.0.1', '502', '0')
  })

  test('deliberate disconnect reports no error', async ({ mainPage }) => {
    await disconnectClient(mainPage)
    await expectCleanDisconnect(mainPage)
  })
})

test.describe.serial('Disconnect messaging — RTU', () => {
  test.skip(!hasSocat, 'socat not available')

  let socatProcess: ChildProcess | null = null

  test('start socat virtual serial pair', async () => {
    for (const pty of [PTY_0, PTY_1]) {
      try {
        unlinkSync(pty)
      } catch {
        /* ignore */
      }
    }

    socatProcess = spawn(SOCAT_PATH, [
      '-d',
      '-d',
      `pty,raw,echo=0,link=${PTY_0}`,
      `pty,raw,echo=0,link=${PTY_1}`
    ])

    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      if (existsSync(PTY_0) && existsSync(PTY_1)) break
      await new Promise((r) => setTimeout(r, 100))
    }

    expect(existsSync(PTY_0)).toBe(true)
    expect(existsSync(PTY_1)).toBe(true)
  })

  test('put the server on the pty', async ({ mainPage }) => {
    await navigateToServer(mainPage)
    await cleanServerState(mainPage)
    await mainPage.getByTestId('server-mode-rtu-btn').click()
    await expect(mainPage.getByTestId('server-rtu-com-input')).toBeVisible()

    const comInput = mainPage.getByTestId('server-rtu-com-input').locator('input')
    await comInput.fill(PTY_0)
    await comInput.blur()

    await expect(mainPage.getByTestId('server-rtu-status')).toHaveAttribute(
      'title',
      'RTU server active',
      { timeout: 5000 }
    )
  })

  test('connect over RTU', async ({ mainPage }) => {
    await navigateToClient(mainPage)
    await connectClientRTU(mainPage, '0', '9600', 'none', '8', '1')

    await mainPage.getByTestId('rtu-com-input').locator('input').fill(PTY_1)
    await mainPage.getByTestId('connect-btn').click()
    await expect(mainPage.getByTestId('connect-btn')).toContainText('Disconnect', {
      timeout: 10_000
    })
  })

  test('deliberate disconnect reports no error', async ({ mainPage }) => {
    await disconnectClient(mainPage)
    await expectCleanDisconnect(mainPage)
  })

  test('cleanup: back to TCP, stop socat', async ({ mainPage }) => {
    await mainPage.getByTestId('protocol-tcp-btn').click()
    await navigateToServer(mainPage)
    await mainPage.getByTestId('server-mode-tcp-btn').click()

    if (socatProcess) {
      socatProcess.kill()
      socatProcess = null
    }
    for (const pty of [PTY_0, PTY_1]) {
      try {
        unlinkSync(pty)
      } catch {
        /* ignore */
      }
    }
  })
})
